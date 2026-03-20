import { useState } from 'react';
import { TouchableOpacity, View, Text, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';

type AvatarPickerProps = {
  profileId: string;
  onUploadSuccess?: (avatarUrl: string) => void;
  onUploadError?: (error: Error) => void;
};

export function AvatarPicker({ profileId, onUploadSuccess, onUploadError }: AvatarPickerProps) {
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
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
      onUploadError?.(error as Error);
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
      const fileName = `${profileId}-${Date.now()}.${fileExt}`;
      const filePath = `${profileId}/${fileName}`;

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
        .eq('id', profileId);

      if (updateError) {
        throw updateError;
      }

      Alert.alert('Éxito', 'Foto de perfil actualizada correctamente.');
      onUploadSuccess?.(filePath);
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Error al subir', 'No se pudo subir la imagen. Intenta de nuevo.');
      onUploadError?.(error as Error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={pickImage}
      disabled={uploading}
      className="mb-4 items-center"
      activeOpacity={0.8}
    >
      <View className="relative">
        <View
          className="border-2 border-dashed border-brand-primary bg-brand-primary/10"
          style={{ height: 88, width: 88, borderRadius: 8 }}
        >
          <View className="flex-1 items-center justify-center">
            {uploading ? (
              <ActivityIndicator size="large" color="#53E076" />
            ) : (
              <>
                <Feather name="camera" size={28} color="#53E076" />
                <Text className="mt-1 text-[9px] font-bold text-brand-primary text-center">
                  Toca para cambiar
                </Text>
              </>
            )}
          </View>
        </View>
        <View className="absolute -bottom-2 -right-2 h-8 w-8 items-center justify-center rounded-full bg-brand-primary">
          <Feather name="plus" size={16} color="#003914" />
        </View>
      </View>
      <Text className="mt-3 text-center text-xs text-neutral-on-surface-variant max-w-[140px]">
        Selecciona una foto cuadrada para tu perfil
      </Text>
    </TouchableOpacity>
  );
}
