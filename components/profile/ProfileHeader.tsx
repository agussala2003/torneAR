import { useState } from 'react';
import { AppIcon } from '@/components/ui/AppIcon';
import { Image, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { ProfileRow } from './types';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { supabase } from '@/lib/supabase';
import CustomAlert from '@/components/ui/CustomAlert';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';

type ProfileHeaderProps = {
  profile: ProfileRow;
  onAvatarUpdate?: (newAvatarUrl: string) => void;
};

function positionLabel(position: string): string {
  return position.replaceAll('_', ' ');
}

export function ProfileHeader({ profile, onAvatarUpdate }: ProfileHeaderProps) {
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
      console.error('Error picking image:', error);
      showAlert('Error', 'No se pudo seleccionar la imagen.');
    }
  };

  const uploadAvatar = async (imageUri: string, mimeType: string) => {
    try {
      setUploading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('No hay sesion activa para subir avatar.');
      }

      const folderOwnerId = profile.auth_user_id || user.id;

      if (folderOwnerId !== user.id) {
        throw new Error('El perfil no corresponde al usuario autenticado.');
      }

      // React Native + Supabase: usar base64/ArrayBuffer (Blob falla en algunos dispositivos)
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const fileData = decode(base64);

      // Generar nombre único
      const fileExt = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
      const fileName = `avatar-${Date.now()}.${fileExt}`;
      // Debe empezar con auth.uid() para cumplir la policy de storage
      const filePath = `${folderOwnerId}/${fileName}`;

      // Subir a Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, fileData, {
          cacheControl: '3600',
          upsert: true,
          contentType: mimeType,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Actualizar profile con la URL del avatar
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: filePath })
        .eq('id', profile.id);

      if (updateError) {
        throw updateError;
      }

      setAvatarPath(filePath);
      onAvatarUpdate?.(filePath);
      showAlert('Exito', 'Foto de perfil actualizada correctamente.');
    } catch (error) {
      console.error('Upload error:', error);
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
          className="border-4 border-brand-primary-container bg-surface-lowest p-1"
          style={{ height: 128, width: 128, borderRadius: 6 }}
        >
          {uploading ? (
            <View 
              className="items-center justify-center bg-surface-high"
              style={{ height: '100%', width: '100%', borderRadius: 6 }}
            >
              <ActivityIndicator size="large" color="#53E076" />
            </View>
          ) : avatarUrl ? (
            <Image 
              source={{ uri: avatarUrl }} 
              style={{ height: '100%', width: '100%', borderRadius: 6 }}
              resizeMode="cover" 
            />
          ) : (
            <View 
              className="items-center justify-center bg-surface-high"
              style={{ height: '100%', width: '100%', borderRadius: 6 }}
            >
              <AppIcon family="material-community" name="account" size={42} color="#BCCBB9" />
            </View>
          )}
        </View>
        {/* Badge: + si no hay foto, ✓ si hay foto */}
        <View className="absolute bottom-3 right-3 rounded-lg border-2 border-surface-base bg-brand-primary p-1">
          <AppIcon 
            family="material-icons" 
            name={avatarUrl ? "verified" : "add"} 
            size={14} 
            color="#003914" 
          />
        </View>
      </TouchableOpacity>

      <Text className="font-displayBlack mt-4 text-3xl tracking-tight text-neutral-on-surface">{profile.full_name}</Text>
      <Text className="font-ui mt-1 text-base text-neutral-on-surface-variant">@{profile.username}</Text>

      <View className="mt-3 flex-row items-center gap-3">
        <View className="flex-row items-center gap-1 rounded-full bg-surface-high px-3 py-1">
          <AppIcon family="material-community" name="map-marker-outline" size={12} color="#8CCDFF" />
          <Text className="font-uiBold text-xs text-neutral-on-surface">{profile.zone ?? 'Sin zona'}</Text>
        </View>

        <View className="flex-row items-center gap-1 rounded-full border border-brand-primary/25 bg-brand-primary-container/20 px-3 py-1">
          <AppIcon family="material-community" name="soccer" size={12} color="#53E076" />
          <Text className="font-display text-xs uppercase text-brand-primary">{positionLabel(profile.preferred_position)}</Text>
        </View>
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
