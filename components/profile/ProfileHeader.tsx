import { useState } from 'react';
import { AppIcon } from '@/components/ui/AppIcon';
import { Image, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { ProfileRow } from './types';
import { calculateAge, formatAge } from '@/lib/age';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { uploadProfileAvatar } from '@/lib/profile-edit-data';
import CustomAlert from '@/components/ui/CustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { Logger } from '@/lib/logger';

type ProfileHeaderProps = {
  profile: ProfileRow;
  onAvatarUpdate?: (newAvatarUrl: string) => void;
};

function positionLabel(position: string): string {
  return position.replaceAll('_', ' ');
}

export function ProfileHeader({ profile, onAvatarUpdate }: ProfileHeaderProps) {
  const { refreshProfile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [avatarPath, setAvatarPath] = useState(profile.avatar_url);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  // Construir URL de avatar desde storage de Supabase
  const avatarUrl = avatarPath
    ? getSupabaseStorageUrl('avatars', avatarPath)
    : null;

  const ageLabel = formatAge(calculateAge(profile.date_of_birth));

  const pickAndUploadImage = async () => {
    try {
      // Solicitar permisos
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        showAlert('Permiso denegado', 'Se necesita acceso a la galeria para seleccionar una imagen.');
        return;
      }

      // Abrir selector de imagen
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1], // Cuadrado
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await uploadAvatar(asset.uri, asset.mimeType ?? 'image/jpeg');
      }
    } catch (error) {
      Logger.error('Fallo el selector de imagen del avatar', {
        scope: 'ProfileHeader.pickImage',
        profileId: profile.id,
        error,
      });
      showAlert('Error', 'No se pudo seleccionar la imagen.');
    }
  };

  const uploadAvatar = async (imageUri: string, mimeType: string) => {
    try {
      setUploading(true);

      const filePath = await uploadProfileAvatar(
        profile.id,
        profile.auth_user_id,
        imageUri,
        mimeType,
      );

      await refreshProfile();

      setAvatarPath(filePath);
      onAvatarUpdate?.(filePath);
      showAlert('Exito', 'Foto de perfil actualizada correctamente.');
    } catch (error) {
      // El bucket `avatars` ya rompió antes por policies de Storage (ver las
      // migraciones 20260727120000 / 20260727140000): que quede registrado.
      Logger.error('Fallo la subida del avatar', {
        scope: 'ProfileHeader.uploadAvatar',
        profileId: profile.id,
        mimeType,
        error,
      });
      showAlert('Error al subir', getGenericSupabaseErrorMessage(error, 'No se pudo subir la imagen. Revisa conexion y politicas del bucket avatars.'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <View className="items-center pt-3">
      <TouchableOpacity 
        onPress={pickAndUploadImage}
        disabled={uploading}
        activeOpacity={0.8}
        className="relative"
      >
        <View
          className="rounded-full border-4 border-brand-primary-container bg-surface-lowest p-1"
          style={{ height: 128, width: 128 }}
        >
          {uploading ? (
            <View
              className="items-center justify-center rounded-full bg-surface-high"
              style={{ height: '100%', width: '100%' }}
            >
              <ActivityIndicator size="large" color="#53E076" />
            </View>
          ) : avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              className="rounded-full"
              style={{ height: '100%', width: '100%' }}
              resizeMode="cover"
            />
          ) : (
            <View
              className="items-center justify-center rounded-full bg-surface-high"
              style={{ height: '100%', width: '100%' }}
            >
              <AppIcon family="material-community" name="account" size={42} color="#BCCBB9" />
            </View>
          )}
        </View>
        {/* Badge: + si no hay foto, ✓ si hay foto.
            bottom/right en 1: con el aro ahora circular, el punto de tangencia
            del círculo queda ~19px adentro de la esquina — un inset de 3 (12px)
            dejaba la insignia flotando lejos del borde visible. */}
        <View className="absolute bottom-1 right-1 rounded-lg border-2 border-surface-base bg-brand-primary p-1">
          <AppIcon 
            family="material-icons" 
            name={avatarUrl ? "verified" : "add"} 
            size={14} 
            color="#003914" 
          />
        </View>
      </TouchableOpacity>

      {/* w-full + px: acota el ancho del texto al del contenedor. Sin esto, un
          nombre largo sin espacios (o con emojis) desborda horizontalmente.
          Se permiten 2 lineas antes de truncar: cortar un nombre completo en la
          primera linea del perfil es demasiado agresivo. */}
      <View className="mt-4 w-full items-center px-6">
        <Text
          className="font-uiBold text-center text-3xl text-neutral-on-surface"
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {profile.full_name}
        </Text>
        <Text
          className="font-ui mt-1 text-center text-base text-neutral-on-surface-variant"
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          @{profile.username}
        </Text>
      </View>

      {/* flex-wrap: con zona y posicion largas los chips bajan de linea en vez
          de estirar la fila fuera de pantalla. */}
      <View className="mt-3 w-full flex-row flex-wrap items-center justify-center gap-3 px-6">
        <View className="max-w-full flex-row items-center gap-1 rounded-full bg-surface-high px-3 py-1">
          <AppIcon family="material-community" name="map-marker-outline" size={12} color="#8CCDFF" />
          <Text
            className="font-uiBold shrink text-xs text-neutral-on-surface"
            numberOfLines={1}
          >
            {profile.zone ?? 'Sin zona'}
          </Text>
        </View>

        <View className="max-w-full flex-row items-center gap-1 rounded-full border border-brand-primary/25 bg-brand-primary-container/20 px-3 py-1">
          <AppIcon family="material-community" name="soccer" size={12} color="#53E076" />
          <Text
            className="font-display shrink text-xs uppercase text-brand-primary"
            numberOfLines={1}
          >
            {positionLabel(profile.preferred_position)}
          </Text>
        </View>

        {/* El chip se omite entero si no hay fecha cargada: un "— años" al lado
            de la zona y la posición se lee como un dato roto, no como uno que
            falta. `date_of_birth` es obligatoria en el onboarding
            (isProfileComplete), así que el caso es el de los perfiles viejos. */}
        {ageLabel && (
          <View className="max-w-full flex-row items-center gap-1 rounded-full bg-surface-high px-3 py-1">
            <AppIcon family="material-community" name="cake-variant-outline" size={12} color="#FABD32" />
            <Text
              className="font-uiBold shrink text-xs text-neutral-on-surface"
              numberOfLines={1}
            >
              {ageLabel}
            </Text>
          </View>
        )}
      </View>

      <CustomAlert
        visible={alertVisible}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertVisible(false)}
      />
    </View>
  );
}
