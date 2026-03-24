import React, { useState, useCallback } from 'react';
import CustomAlert from '@/components/ui/CustomAlert';

export function useCustomAlert() {
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [onCloseCallback, setOnCloseCallback] = useState<(() => void) | null>(null);

  const showAlert = useCallback((title: string, message: string, onClose?: () => void) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
    setOnCloseCallback(() => onClose ?? null);
  }, []);

  const hideAlert = useCallback(() => {
    setAlertVisible(false);
    if (onCloseCallback) {
      onCloseCallback();
      setOnCloseCallback(null);
    }
  }, [onCloseCallback]);

  const AlertComponent = (
    <CustomAlert
      visible={alertVisible}
      title={alertTitle}
      message={alertMessage}
      onClose={hideAlert}
    />
  );

  return { showAlert, hideAlert, AlertComponent };
}
