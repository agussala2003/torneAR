import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Image, Text, View, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ProfileRow } from './types';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { supabase } from '@/lib/supabase';

type ProfileHeaderProps = {
  profile: ProfileRow;
  onAvatarUpdate?: (newAvatarUrl: string) => void;
};

function positionLabel(position: string): string {
  return position.replaceAll('_', ' ');
}

export function ProfileHeader({ profile, onAvatarUpdate }: ProfileHeaderProps) {
  const [uploading, setUploading] = useState(false);

  // Construir URL de avatar desde storage de Supabase
  const avatarUrl = profile.avatar_url 
    ? getSupabaseStorageUrl('avatars', profile.avatar_url)
    : null;

  const pickAndUploadImage = async () => {
    try {
      // Solicitar permisos
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('Permiso denegado', 'Se necesita acceso a la galería para seleccionar una imagen.');
        return;
      }

      // Abrir selector de imagen
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1], // Cuadrado
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await uploadAvatar(asset.uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'No se pudo seleccionar la imagen.');
    }
  };

  const uploadAvatar = async (imageUri: string) => {
    try {
      setUploading(true);

      // Leer archivo
      const response = await fetch(imageUri);
      const blob = await response.blob();

      // Generar nombre único
      const fileExt = 'jpg';
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`;
      const filePath = `${profile.id}/${fileName}`;

      // Subir a Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, blob, {
          cacheControl: '3600',
          upsert: true,
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

      onAvatarUpdate?.(filePath);
      Alert.alert('Éxito', 'Foto de perfil actualizada correctamente.');
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Error al subir', 'No se pudo subir la imagen. Intenta de nuevo.');
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
          style={{ height: 128, width: 128, borderRadius: 8 }}
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
              <Feather name="user" size={42} color="#BCCBB9" />
            </View>
          )}
        </View>
        {/* Badge: + si no hay foto, ✓ si hay foto */}
        <View className="absolute bottom-1 right-1 rounded-full border-2 border-surface-base bg-brand-primary p-2">
          <Feather 
            name={avatarUrl ? "check" : "plus"} 
            size={12} 
            color="#003914" 
          />
        </View>
      </TouchableOpacity>

      <Text className="mt-4 text-3xl font-black tracking-tight text-neutral-on-surface">{profile.full_name}</Text>
      <Text className="mt-1 text-base font-medium text-neutral-on-surface-variant">@{profile.username}</Text>

      <View className="mt-3 flex-row items-center gap-3">
        <View className="flex-row items-center gap-1 rounded-full bg-surface-high px-3 py-1">
          <Feather name="map-pin" size={12} color="#8CCDFF" />
          <Text className="text-xs font-semibold text-neutral-on-surface">{profile.zone ?? 'Sin zona'}</Text>
        </View>

        <View className="flex-row items-center gap-1 rounded-full border border-brand-primary/25 bg-brand-primary-container/20 px-3 py-1">
          <Feather name="crosshair" size={12} color="#53E076" />
          <Text className="text-xs font-bold uppercase text-brand-primary">{positionLabel(profile.preferred_position)}</Text>
        </View>
      </View>
    </View>
  );
}
