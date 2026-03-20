import React from 'react';
import { Modal, View, Text, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';

interface CustomAlertProps {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
}

export default function CustomAlert({ visible, title, message, onClose }: CustomAlertProps) {
  return (
    <Modal
      transparent={true}
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 justify-center items-center bg-black/80 p-6">
          <TouchableWithoutFeedback>
            <View className="w-full max-w-sm bg-zinc-900 border border-[#3d4a3d] rounded-2xl p-6 shadow-2xl">
              <Text className="text-xl font-bold text-[#e5e2e1] mb-2">{title}</Text>
              <Text className="text-base text-[#bccbb9] mb-6 leading-6">{message}</Text>
              
              <TouchableOpacity
                onPress={onClose}
                className="w-full bg-[#53e076] py-3 rounded-xl items-center active:scale-95"
              >
                <Text className="text-[#003914] font-bold text-base uppercase tracking-wider">
                  Aceptar
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
