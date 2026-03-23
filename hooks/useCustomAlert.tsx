import React, { useState, useCallback } from 'react';
import CustomAlert from '@/components/ui/CustomAlert';

export function useCustomAlert() {
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const showAlert = useCallback((title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  }, []);

  const hideAlert = useCallback(() => {
    setAlertVisible(false);
  }, []);

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
