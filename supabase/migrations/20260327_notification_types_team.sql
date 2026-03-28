-- ============================================================
--  Agrega tipos de notificación específicos para gestión de equipo
--  Reemplaza el uso genérico de MENSAJE_NUEVO en esas situaciones
-- ============================================================

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ROL_ACTUALIZADO';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'EXPULSADO_EQUIPO';
