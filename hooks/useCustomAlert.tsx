import React, { useState, useCallback } from 'react';
import CustomAlert, { AlertType } from '@/components/ui/CustomAlert';

export function useCustomAlert() {
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertType, setAlertType] = useState<AlertType>('info');
  const [onCloseCallback, setOnCloseCallback] = useState<(() => void) | null>(null);

  const showAlert = useCallback((title: string, message: string, onClose?: () => void, type: AlertType = 'info') => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertType(type);
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
      type={alertType}
    />
  );

  return { showAlert, hideAlert, AlertComponent };
}
