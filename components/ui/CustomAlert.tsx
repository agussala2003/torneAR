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
            <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-6 shadow-2xl">
              <Text className="font-display mb-2 text-xl text-neutral-on-surface">{title}</Text>
              <Text className="font-ui mb-6 text-base leading-6 text-neutral-on-surface-variant">{message}</Text>
              
              <TouchableOpacity
                onPress={onClose}
                className="w-full rounded-xl bg-brand-primary py-3 items-center active:scale-95"
              >
                <Text className="font-display text-base uppercase tracking-wider text-[#003914]">
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
