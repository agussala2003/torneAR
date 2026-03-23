import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, ScrollView, Share, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import CustomAlert from '@/components/ui/CustomAlert';
import { GlobalLoader } from '@/components/GlobalLoader';
import { AppIcon } from '@/components/ui/AppIcon';
import { useAuth } from '@/context/AuthContext';
import { getGenericSupabaseErrorMessage } from '@/lib/auth-error-messages';
import { supabase } from '@/lib/supabase';
import { getSupabaseStorageUrl } from '@/lib/supabase-storage';
import { getTeamCategoryLabel, getTeamFormatLabel, getTeamRoleLabel, TEAM_CATEGORY_OPTIONS, TEAM_FORMAT_OPTIONS, TeamCategory, TeamFormat, TeamRole } from '@/lib/team-options';
import { positionLabel, firstLetterUpper, requestStatusChip, roleAppearance, canManageMember, allowedRolesToAssign } from '@/lib/team-helpers';
import { TeamMembersList } from '@/components/team-manage/TeamMembersList';

type TeamDetail = {
  id: string;
  name: string;
  zone: string;
  category: TeamCategory;
  preferred_format: TeamFormat;
  invite_code: string;
  elo_rating: number;
  matches_played: number;
  fair_play_score: number;
  shield_url: string | null;
};

type TeamMemberRow = {
  profile_id: string;
  role: TeamRole;
  joined_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
    preferred_position: string | null;
  } | null;
};

type TeamJoinRequestRow = {
  id: string;
  profile_id: string;
  status: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
  created_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    username: string | null;
    avatar_url: string | null;
    preferred_position: string;
  } | null;
};



export default function TeamManageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ teamId?: string | string[] }>();
  const { profile } = useAuth();

  const teamId = useMemo(() => {
    if (Array.isArray(params.teamId)) {
      return params.teamId[0];
    }

    return params.teamId;
  }, [params.teamId]);

  const [loading, setLoading] = useState(true);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [processingMemberId, setProcessingMemberId] = useState<string | null>(null);
  const [savingTeam, setSavingTeam] = useState(false);
  const [uploadingShield, setUploadingShield] = useState(false);

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<TeamJoinRequestRow[]>([]);
  const [historyRequests, setHistoryRequests] = useState<TeamJoinRequestRow[]>([]);

  const [showEditTeamModal, setShowEditTeamModal] = useState(false);
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [zones, setZones] = useState<string[]>([]);
  const [loadingZones, setLoadingZones] = useState(false);
  const [editName, setEditName] = useState('');
  const [editZone, setEditZone] = useState('');
  const [editCategory, setEditCategory] = useState<TeamCategory>('HOMBRES');
  const [editFormat, setEditFormat] = useState<TeamFormat>('FUTBOL_7');

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [memberForRoleUpdate, setMemberForRoleUpdate] = useState<TeamMemberRow | null>(null);
  const [selectedRoleToAssign, setSelectedRoleToAssign] = useState<TeamRole>('JUGADOR');

  const [showRemoveConfirmModal, setShowRemoveConfirmModal] = useState(false);
  const [memberForRemove, setMemberForRemove] = useState<TeamMemberRow | null>(null);

  const [showTransferCaptainModal, setShowTransferCaptainModal] = useState(false);
  const [transferCaptainToProfileId, setTransferCaptainToProfileId] = useState<string | null>(null);

  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const showAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertVisible(true);
  };

  const myRole = useMemo(() => {
    if (!profile) {
      return null;
    }

    return members.find((member) => member.profile_id === profile.id)?.role ?? null;
  }, [members, profile]);

  const canEditTeam = myRole === 'CAPITAN' || myRole === 'SUBCAPITAN';
  const canModerateRequests = myRole === 'CAPITAN' || myRole === 'SUBCAPITAN';
  const allowedRoleOptions = allowedRolesToAssign(myRole);
  const transferableCaptainCandidates = useMemo(() => {
    if (!profile) {
      return [];
    }

    return members.filter((member) => member.profile_id !== profile.id);
  }, [members, profile]);

  const loadZoneOptions = async () => {
    try {
      setLoadingZones(true);
      const { data, error } = await supabase
        .from('zones')
        .select('name')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) {
        throw error;
      }

      setZones((data ?? []).map((zoneRow) => zoneRow.name));
    } catch {
      setZones(editZone ? [editZone] : team?.zone ? [team.zone] : []);
    } finally {
      setLoadingZones(false);
    }
  };

  const refreshTeamData = useCallback(async () => {
    if (!teamId) {
      return;
    }

    const [teamRes, membersRes, pendingRes, historyRes] = await Promise.all([
      supabase
        .from('teams')
        .select('id, name, zone, category, preferred_format, invite_code, elo_rating, matches_played, fair_play_score, shield_url')
        .eq('id', teamId)
        .maybeSingle(),
      supabase
        .from('team_members')
        .select('profile_id, role, joined_at, profiles(id, full_name, username, avatar_url, preferred_position)')
        .eq('team_id', teamId)
        .order('joined_at', { ascending: true }),
      supabase
        .from('team_join_requests')
        .select('id, profile_id, status, created_at, profiles(id, full_name, username, avatar_url, preferred_position)')
        .eq('team_id', teamId)
        .eq('status', 'PENDIENTE')
        .order('created_at', { ascending: true }),
      supabase
        .from('team_join_requests')
        .select('id, profile_id, status, created_at, profiles(id, full_name, username, avatar_url, preferred_position)')
        .eq('team_id', teamId)
        .in('status', ['ACEPTADA', 'RECHAZADA'])
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (teamRes.error) throw teamRes.error;
    if (membersRes.error) throw membersRes.error;
    if (pendingRes.error) throw pendingRes.error;
    if (historyRes.error) throw historyRes.error;

    const membersData = (membersRes.data as TeamMemberRow[] | null) ?? [];
    const teamData = (teamRes.data as TeamDetail | null) ?? null;

    setTeam(teamData);
    setMembers(membersData);

    const selfRole = profile ? membersData.find((member) => member.profile_id === profile.id)?.role : null;
    const selfCanModerate = selfRole === 'CAPITAN' || selfRole === 'SUBCAPITAN';

    if (selfCanModerate) {
      setPendingRequests((pendingRes.data as TeamJoinRequestRow[] | null) ?? []);
      setHistoryRequests((historyRes.data as TeamJoinRequestRow[] | null) ?? []);
    } else {
      setPendingRequests([]);
      setHistoryRequests([]);
    }
  }, [profile, teamId]);

  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      return;
    }

    let mounted = true;

    async function loadTeam() {
      try {
        setLoading(true);
        await refreshTeamData();
      } catch (error) {
        if (mounted) {
          showAlert('Error al cargar equipo', getGenericSupabaseErrorMessage(error, 'No se pudo cargar la gestion del equipo.'));
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadTeam();

    return () => {
      mounted = false;
    };
  }, [refreshTeamData, teamId]);

  const handlePickShield = async () => {
    if (!team || !teamId || !canEditTeam) {
      showAlert('Sin permisos', 'Solo capitan y subcapitan pueden actualizar el escudo.');
      return;
    }

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        showAlert('Permiso denegado', 'Se necesita acceso a la galeria para seleccionar una imagen.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'image/jpeg';

      setUploadingShield(true);

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const fileData = decode(base64);

      const fileExt = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
      const filePath = `${teamId}/shield-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('shields')
        .upload(filePath, fileData, {
          cacheControl: '3600',
          upsert: true,
          contentType: mimeType,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { error: updateError } = await supabase
        .from('teams')
        .update({ shield_url: filePath, updated_at: new Date().toISOString() })
        .eq('id', teamId);

      if (updateError) {
        throw updateError;
      }

      await refreshTeamData();
      showAlert('Escudo actualizado', 'El escudo del equipo se actualizo correctamente.');
    } catch (error) {
      showAlert('Error al subir escudo', getGenericSupabaseErrorMessage(error, 'No se pudo subir el escudo del equipo.'));
    } finally {
      setUploadingShield(false);
    }
  };

  const openEditTeamModal = async () => {
    if (!team) {
      return;
    }

    if (!canEditTeam) {
      showAlert('Sin permisos', 'Solo capitan y subcapitan pueden editar los datos del equipo.');
      return;
    }

    setEditName(team.name);
    setEditZone(team.zone);
    setEditCategory(team.category);
    setEditFormat(team.preferred_format);
    setShowEditTeamModal(true);
    await loadZoneOptions();
  };

  const handleSaveTeam = async () => {
    if (!teamId) {
      return;
    }

    const sanitizedName = editName.trim();
    const sanitizedZone = editZone.trim();

    if (sanitizedName.length < 3) {
      showAlert('Nombre invalido', 'El nombre del equipo debe tener al menos 3 caracteres.');
      return;
    }

    if (!sanitizedZone) {
      showAlert('Zona requerida', 'Selecciona una zona para el equipo.');
      return;
    }

    try {
      setSavingTeam(true);

      const { error } = await supabase
        .from('teams')
        .update({
          name: sanitizedName,
          zone: sanitizedZone,
          category: editCategory,
          preferred_format: editFormat,
          updated_at: new Date().toISOString(),
        })
        .eq('id', teamId);

      if (error) {
        throw error;
      }

      await refreshTeamData();
      setShowEditTeamModal(false);
      showAlert('Equipo actualizado', 'Los datos principales del equipo fueron actualizados.');
    } catch (error) {
      showAlert('Error al guardar', getGenericSupabaseErrorMessage(error, 'No se pudieron actualizar los datos del equipo.'));
    } finally {
      setSavingTeam(false);
    }
  };

  const handleApproveRequest = async (request: TeamJoinRequestRow) => {
    if (!teamId) {
      return;
    }

    try {
      setProcessingRequestId(request.id);

      const { error: insertMemberError } = await supabase.from('team_members').insert({
        team_id: teamId,
        profile_id: request.profile_id,
        role: 'JUGADOR',
      });

      if (insertMemberError && insertMemberError.code !== '23505') {
        throw insertMemberError;
      }

      const { error: updateRequestError } = await supabase
        .from('team_join_requests')
        .update({ status: 'ACEPTADA', updated_at: new Date().toISOString() })
        .eq('id', request.id)
        .eq('status', 'PENDIENTE');

      if (updateRequestError) {
        throw updateRequestError;
      }

      await refreshTeamData();
      showAlert('Solicitud aprobada', 'El jugador fue agregado al plantel.');
    } catch (error) {
      showAlert('Error al aprobar', getGenericSupabaseErrorMessage(error, 'No se pudo aprobar la solicitud.'));
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRejectRequest = async (request: TeamJoinRequestRow) => {
    try {
      setProcessingRequestId(request.id);

      const { error } = await supabase
        .from('team_join_requests')
        .update({ status: 'RECHAZADA', updated_at: new Date().toISOString() })
        .eq('id', request.id)
        .eq('status', 'PENDIENTE');

      if (error) {
        throw error;
      }

      await refreshTeamData();
      showAlert('Solicitud rechazada', 'La solicitud fue rechazada.');
    } catch (error) {
      showAlert('Error al rechazar', getGenericSupabaseErrorMessage(error, 'No se pudo rechazar la solicitud.'));
    } finally {
      setProcessingRequestId(null);
    }
  };

  const openRoleModal = (member: TeamMemberRow, isSelf: boolean) => {
    if (!canManageMember(myRole, member.role, isSelf)) {
      showAlert('Sin permisos', 'No tienes permisos para cambiar el rol de este miembro.');
      return;
    }

    const options = allowedRoleOptions;
    const defaultRole = options.includes(member.role) ? member.role : options[0] ?? 'JUGADOR';

    setMemberForRoleUpdate(member);
    setSelectedRoleToAssign(defaultRole);
    setShowRoleModal(true);
  };

  const handleConfirmRoleChange = async () => {
    if (!teamId || !memberForRoleUpdate) {
      return;
    }

    try {
      setProcessingMemberId(memberForRoleUpdate.profile_id);

      const { error } = await supabase
        .from('team_members')
        .update({ role: selectedRoleToAssign })
        .eq('team_id', teamId)
        .eq('profile_id', memberForRoleUpdate.profile_id);

      if (error) {
        throw error;
      }

      await refreshTeamData();
      setShowRoleModal(false);
      setMemberForRoleUpdate(null);
      showAlert('Rol actualizado', `Nuevo rol: ${getTeamRoleLabel(selectedRoleToAssign)}.`);
    } catch (error) {
      showAlert('Error al cambiar rol', getGenericSupabaseErrorMessage(error, 'No se pudo actualizar el rol del miembro.'));
    } finally {
      setProcessingMemberId(null);
    }
  };

  const askRemoveMember = (member: TeamMemberRow, isSelf: boolean) => {
    if (!canManageMember(myRole, member.role, isSelf)) {
      showAlert('Sin permisos', 'No tienes permisos para remover a este miembro.');
      return;
    }

    setMemberForRemove(member);
    setShowRemoveConfirmModal(true);
  };

  const handleConfirmRemoveMember = async () => {
    if (!teamId || !memberForRemove) {
      return;
    }

    try {
      setProcessingMemberId(memberForRemove.profile_id);

      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('profile_id', memberForRemove.profile_id);

      if (error) {
        throw error;
      }

      await refreshTeamData();
      setShowRemoveConfirmModal(false);
      setMemberForRemove(null);
      showAlert('Miembro removido', 'El jugador fue removido del plantel.');
    } catch (error) {
      showAlert('Error al remover', getGenericSupabaseErrorMessage(error, 'No se pudo remover al miembro.'));
    } finally {
      setProcessingMemberId(null);
    }
  };

  const handleConfirmLeaveTeam = async () => {
    if (!teamId || !profile) {
      return;
    }

    if (myRole === 'CAPITAN') {
      showAlert('Accion no disponible', 'El capitan no puede abandonar el equipo sin transferir la capitania.');
      return;
    }

    try {
      setProcessingMemberId(profile.id);

      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('profile_id', profile.id);

      if (error) {
        throw error;
      }

      setShowLeaveConfirmModal(false);
      showAlert('Equipo abandonado', 'Saliste del equipo correctamente.');
      router.replace('/(tabs)/profile');
    } catch (error) {
      showAlert('Error al abandonar', getGenericSupabaseErrorMessage(error, 'No se pudo abandonar el equipo.'));
    } finally {
      setProcessingMemberId(null);
    }
  };

  const startLeaveFlow = () => {
    if (!myRole) {
      return;
    }

    if (myRole === 'CAPITAN') {
      if (transferableCaptainCandidates.length === 0) {
        showAlert('No se puede abandonar', 'Necesitas al menos otro miembro para transferir la capitania y salir.');
        return;
      }

      setTransferCaptainToProfileId((currentValue) => currentValue ?? transferableCaptainCandidates[0].profile_id);
      setShowTransferCaptainModal(true);
      return;
    }

    setShowLeaveConfirmModal(true);
  };

  const handleConfirmTransferCaptainAndLeave = async () => {
    if (!teamId || !profile || !transferCaptainToProfileId) {
      return;
    }

    const newCaptain = transferableCaptainCandidates.find((member) => member.profile_id === transferCaptainToProfileId);
    if (!newCaptain) {
      showAlert('Seleccion requerida', 'Selecciona un miembro para transferir la capitania.');
      return;
    }

    try {
      setProcessingMemberId(profile.id);

      const { error: transferError } = await supabase
        .from('team_members')
        .update({ role: 'CAPITAN' })
        .eq('team_id', teamId)
        .eq('profile_id', transferCaptainToProfileId);

      if (transferError) {
        throw transferError;
      }

      const { error: leaveError } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('profile_id', profile.id);

      if (leaveError) {
        await supabase
          .from('team_members')
          .update({ role: newCaptain.role })
          .eq('team_id', teamId)
          .eq('profile_id', transferCaptainToProfileId);
        throw leaveError;
      }

      setShowTransferCaptainModal(false);
      showAlert('Capitania transferida', 'Transferiste la capitania y saliste del equipo correctamente.');
      router.replace('/(tabs)/profile');
    } catch (error) {
      showAlert('Error al transferir', getGenericSupabaseErrorMessage(error, 'No se pudo transferir la capitania y abandonar el equipo.'));
    } finally {
      setProcessingMemberId(null);
    }
  };

  const handleShareInvite = async () => {
    if (!team) {
      return;
    }

    try {
      await Share.share({
        message: `Unite a ${team.name} en TorneAR\nCodigo de invitacion: ${team.invite_code}`,
      });
    } catch (error) {
      showAlert('No se pudo compartir', getGenericSupabaseErrorMessage(error, 'Intenta nuevamente en unos segundos.'));
    }
  };

  const handleCopyInviteCode = async () => {
    if (!team) {
      return;
    }

    try {
      await Clipboard.setStringAsync(team.invite_code);
      showAlert('Codigo copiado', 'El codigo de invitacion fue copiado al portapapeles.');
    } catch (error) {
      showAlert('No se pudo copiar', getGenericSupabaseErrorMessage(error, 'Intenta nuevamente en unos segundos.'));
    }
  };

  if (loading) {
    return <GlobalLoader label="Cargando equipo" />;
  }

  if (!team) {
    return (
      <SafeAreaView className="flex-1 bg-surface-base px-6">
        <View className="pt-4">
          <TouchableOpacity className="w-10" activeOpacity={0.8} onPress={() => router.back()}>
            <AppIcon family="material-icons" name="arrow-back-ios-new" size={22} color="#BCCBB9" />
          </TouchableOpacity>
        </View>
        <View className="flex-1 items-center justify-center">
          <Text className="font-display text-xl text-neutral-on-surface">Equipo no disponible</Text>
          <Text className="font-ui mt-2 text-center text-neutral-on-surface-variant">No encontramos informacion para este equipo.</Text>
        </View>

        <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} onClose={() => setAlertVisible(false)} />
      </SafeAreaView>
    );
  }

  const shieldUrl = team.shield_url ? getSupabaseStorageUrl('shields', team.shield_url) : '';

  return (
    <SafeAreaView className="flex-1 bg-surface-base">
      <View className="px-4 pb-2 pt-1">
        <TouchableOpacity className="w-10" activeOpacity={0.8} onPress={() => router.back()}>
          <AppIcon family="material-icons" name="arrow-back-ios-new" size={22} color="#BCCBB9" />
        </TouchableOpacity>
      </View>

      <ScrollView className="px-4" contentContainerStyle={{ paddingBottom: 36 }}>
        <Text className="font-displayBlack text-3xl uppercase tracking-tight text-neutral-on-surface">Gestion de equipo</Text>
        <Text className="font-ui mt-1 text-sm text-neutral-on-surface-variant">Administracion y estado de tu plantel.</Text>

        <View className="relative mt-6 rounded-xl border border-neutral-outline-variant/35 bg-surface-low p-4">
          <TouchableOpacity
            onPress={openEditTeamModal}
            disabled={!canEditTeam}
            activeOpacity={0.9}
            className={`absolute right-3 top-3 z-10 h-8 w-8 items-center justify-center rounded-md ${canEditTeam ? 'bg-surface-high' : 'bg-surface-high/50'}`}
          >
            <AppIcon family="material-community" name="pencil-outline" size={16} color={canEditTeam ? '#BCCBB9' : '#7B7A79'} />
          </TouchableOpacity>

          <View className="flex-row items-center gap-4 pr-10">
            <TouchableOpacity onPress={handlePickShield} disabled={uploadingShield} activeOpacity={0.85} className="relative">
              <View className="border-4 border-brand-primary-container bg-surface-lowest p-1" style={{ height: 84, width: 84, borderRadius: 8 }}>
                {uploadingShield ? (
                  <View className="h-full w-full items-center justify-center rounded-md bg-surface-high">
                    <ActivityIndicator size="small" color="#53E076" />
                  </View>
                ) : shieldUrl ? (
                  <Image source={{ uri: shieldUrl }} className="h-full w-full rounded-md" resizeMode="cover" />
                ) : (
                  <View className="h-full w-full items-center justify-center rounded-md bg-surface-high">
                    <AppIcon family="material-community" name="shield-outline" size={24} color="#BCCBB9" />
                  </View>
                )}
              </View>
              <View className="absolute bottom-1.5 right-1.5 rounded-md border-2 border-surface-base bg-brand-primary p-1">
                <AppIcon family="material-icons" name={shieldUrl ? 'verified' : 'add'} size={12} color="#003914" />
              </View>
            </TouchableOpacity>

            <View className="flex-1">
              <Text className="font-display text-2xl text-neutral-on-surface">{team.name}</Text>
              <Text className="font-ui mt-1 text-sm text-neutral-on-surface-variant">{team.zone}</Text>
            </View>
          </View>

          <View className="mt-4 flex-row flex-wrap items-center gap-2">
            <Text className="font-uiBold rounded bg-brand-primary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-brand-primary">{getTeamCategoryLabel(team.category)}</Text>
            <Text className="font-uiBold rounded bg-info-secondary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-info-secondary">{getTeamFormatLabel(team.preferred_format)}</Text>
            {myRole ? (
              <Text className="font-uiBold rounded bg-surface-high px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">{getTeamRoleLabel(myRole)}</Text>
            ) : null}
          </View>

          <View className="mt-4 rounded-lg bg-surface-high px-3 py-2.5">
            <Text className="font-display text-[10px] uppercase tracking-widest text-neutral-on-surface-variant">Codigo de invitacion</Text>
            <View className="mt-1.5 flex-row items-center justify-between">
              <Text className="font-displayBlack text-xl uppercase tracking-[1px] text-brand-primary">{team.invite_code}</Text>
              <View className="flex-row items-center gap-1">
                <TouchableOpacity
                  onPress={handleCopyInviteCode}
                  activeOpacity={0.9}
                  className="h-8 w-8 items-center justify-center rounded-md bg-surface-variant"
                >
                  <AppIcon family="material-icons" name="content-copy" size={16} color="#BCCBB9" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleShareInvite}
                  activeOpacity={0.9}
                  className="h-8 w-8 items-center justify-center rounded-md bg-surface-variant"
                >
                  <AppIcon family="material-community" name="share-variant" size={16} color="#BCCBB9" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        <View className="mt-4 rounded-xl bg-surface-low p-4">
          <Text className="font-display mb-3 text-xs uppercase tracking-wider text-neutral-on-surface-variant">Resumen</Text>
          <View className="flex-row gap-3">
            <View className="flex-1 rounded-lg bg-surface-high px-3 py-3">
              <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">PR</Text>
              <Text className="font-display mt-1 text-xl text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>{team.elo_rating}</Text>
            </View>
            <View className="flex-1 rounded-lg bg-surface-high px-3 py-3">
              <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Partidos</Text>
              <Text className="font-display mt-1 text-xl text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>{team.matches_played}</Text>
            </View>
            <View className="flex-1 rounded-lg bg-surface-high px-3 py-3">
              <Text className="font-ui text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Fair Play</Text>
              <Text className="font-display mt-1 text-xl text-neutral-on-surface" style={{ fontVariant: ['tabular-nums'] }}>{Number(team.fair_play_score).toFixed(1)}</Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => {
              if (profile?.id) {
                router.push({ pathname: '/profile-stats', params: { profileId: profile.id } });
              }
            }}
            className="mt-3 flex-row items-center justify-center gap-2 rounded-lg bg-surface-high py-2.5"
          >
            <AppIcon family="material-community" name="chart-timeline-variant" size={15} color="#8CCDFF" />
            <Text className="font-display text-[10px] uppercase tracking-wider text-info-secondary">Ver stats detalladas</Text>
          </TouchableOpacity>
        </View>

        {canModerateRequests ? (
          <View className="mt-4 rounded-xl bg-surface-low p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">Solicitudes pendientes</Text>
              <Text className="font-ui text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>{pendingRequests.length}</Text>
            </View>

            {pendingRequests.length === 0 ? (
              <Text className="font-ui text-sm text-neutral-on-surface-variant">No hay solicitudes pendientes.</Text>
            ) : pendingRequests.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {pendingRequests.map((request) => (
                  <View key={request.id} className="w-[280px] rounded-lg bg-surface-high px-3 py-3">
                    <View className="flex-row items-start gap-3">
                      <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-surface-variant">
                        {request.profiles?.avatar_url ? (
                          <Image
                            source={{
                              uri: request.profiles.avatar_url.startsWith('http')
                                ? request.profiles.avatar_url
                                : getSupabaseStorageUrl('avatars', request.profiles.avatar_url),
                            }}
                            className="h-full w-full"
                          />
                        ) : (
                          <AppIcon family="material-community" name="account" size={18} color="#BCCBB9" />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="font-uiBold text-sm text-neutral-on-surface">{request.profiles?.full_name ?? request.profiles?.username ?? 'Jugador'}</Text>
                        <Text className="font-ui text-xs text-neutral-on-surface-variant">@{request.profiles?.username ?? 'sin_usuario'}</Text>
                      </View>
                      <Text className="font-uiBold rounded bg-brand-primary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-brand-primary">
                        {positionLabel(request.profiles?.preferred_position ?? 'CUALQUIERA')}
                      </Text>
                    </View>


                    <View className="mt-3 flex-row gap-2">
                      {processingRequestId === request.id ? (
                        <View className="w-full flex-row items-center justify-center rounded-md bg-surface-variant py-2.5">
                          <ActivityIndicator size="small" color="#BCCBB9" />
                          <Text className="font-display ml-2 text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Procesando...</Text>
                        </View>
                      ) : (
                        <>
                          <TouchableOpacity
                            onPress={() => handleRejectRequest(request)}
                            activeOpacity={0.9}
                            className="flex-1 flex-row items-center justify-center rounded-md border border-neutral-outline-variant/15 py-2.5"
                          >
                            <AppIcon family="material-community" name="close" size={16} color="#BCCBB9" />
                            <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Rechazar</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleApproveRequest(request)}
                            activeOpacity={0.9}
                            className="flex-1 flex-row items-center justify-center rounded-md bg-brand-primary py-2.5"
                          >
                            <AppIcon family="material-community" name="check" size={16} color="#003914" />
                            <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-[#003914]">Aprobar</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View className="gap-2">
                {pendingRequests.map((request) => (
                  <View key={request.id} className="rounded-lg bg-surface-high px-3 py-3">
                    <View className="flex-row items-start gap-3">
                      <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-surface-variant">
                        {request.profiles?.avatar_url ? (
                          <Image
                            source={{
                              uri: request.profiles.avatar_url.startsWith('http')
                                ? request.profiles.avatar_url
                                : getSupabaseStorageUrl('avatars', request.profiles.avatar_url),
                            }}
                            className="h-full w-full"
                          />
                        ) : (
                          <AppIcon family="material-community" name="account" size={18} color="#BCCBB9" />
                        )}
                      </View>
                      <View className="flex-1">
                        <Text className="font-uiBold text-sm text-neutral-on-surface">{request.profiles?.full_name ?? request.profiles?.username ?? 'Jugador'}</Text>
                        <Text className="font-ui text-xs text-neutral-on-surface-variant">@{request.profiles?.username ?? 'sin_usuario'}</Text>
                      </View>
                      <Text className="font-uiBold rounded bg-brand-primary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-brand-primary">
                        {positionLabel(request.profiles?.preferred_position ?? 'CUALQUIERA')}
                      </Text>
                    </View>

                    <View className="mt-3 flex-row gap-2">
                      {processingRequestId === request.id ? (
                        <View className="w-full flex-row items-center justify-center rounded-md bg-surface-variant py-2.5">
                          <ActivityIndicator size="small" color="#BCCBB9" />
                          <Text className="font-display ml-2 text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Procesando...</Text>
                        </View>
                      ) : (
                        <>
                          <TouchableOpacity
                            onPress={() => handleRejectRequest(request)}
                            activeOpacity={0.9}
                            className="flex-1 flex-row items-center justify-center rounded-md border border-neutral-outline-variant/15 py-2.5"
                          >
                            <AppIcon family="material-community" name="close" size={16} color="#BCCBB9" />
                            <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Rechazar</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() => handleApproveRequest(request)}
                            activeOpacity={0.9}
                            className="flex-1 flex-row items-center justify-center rounded-md bg-brand-primary py-2.5"
                          >
                            <AppIcon family="material-community" name="check" size={16} color="#003914" />
                            <Text className="font-display ml-1.5 text-[11px] uppercase tracking-wide text-[#003914]">Aprobar</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        <View className="mt-4 rounded-xl bg-surface-low p-4">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">Plantel</Text>
            <Text className="font-ui text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>{members.length} miembros</Text>
          </View>

          <TeamMembersList
            members={members}
            myRole={myRole}
            profileId={profile?.id}
            processingMemberId={processingMemberId}
            openRoleModal={openRoleModal}
            askRemoveMember={askRemoveMember}
          />

          {myRole ? (
            <View className="mt-4">
              <TouchableOpacity
                onPress={startLeaveFlow}
                disabled={processingMemberId === profile?.id}
                activeOpacity={0.9}
                className={`flex-row items-center justify-center rounded-lg py-3 ${myRole === 'CAPITAN' ? 'border border-info-secondary/35 bg-info-secondary/10' : 'border border-danger-error/35 bg-danger-error/10'}`}
              >
                <AppIcon family="material-community" name="exit-to-app" size={16} color={myRole === 'CAPITAN' ? '#8FD5FF' : '#FFB4AB'} />
                <Text className={`font-display ml-1.5 text-[11px] uppercase tracking-wide ${myRole === 'CAPITAN' ? 'text-info-secondary' : 'text-danger-error'}`}>
                  {myRole === 'CAPITAN' ? 'Transferir capitania y salir' : 'Abandonar equipo'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        {canModerateRequests ? (
          <View className="mt-4 rounded-xl bg-surface-low p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">Historial de solicitudes</Text>
              <Text className="font-ui text-xs text-neutral-on-surface-variant" style={{ fontVariant: ['tabular-nums'] }}>{historyRequests.length}</Text>
            </View>

            {historyRequests.length === 0 ? (
              <Text className="font-ui text-sm text-neutral-on-surface-variant">Todavia no hay historial.</Text>
            ) : historyRequests.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {historyRequests.map((request) => {
                  const chip = requestStatusChip(request.status);

                  return (
                    <View key={request.id} className="w-[280px] rounded-lg bg-surface-high px-3 py-3">
                      <Text className="font-uiBold text-sm text-neutral-on-surface">{request.profiles?.full_name ?? request.profiles?.username ?? 'Jugador'}</Text>
                      <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">@{request.profiles?.username ?? 'sin_usuario'}</Text>
                      <View className="mt-2 flex-row items-center justify-between">
                        <Text className="font-ui text-[11px] text-neutral-on-surface-variant">{new Date(request.created_at).toLocaleDateString('es-AR')}</Text>
                        <Text className={`font-uiBold rounded px-2 py-1 text-[10px] uppercase tracking-wide ${chip.className}`}>{chip.label}</Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <View className="gap-2">
                {historyRequests.map((request) => {
                  const chip = requestStatusChip(request.status);

                  return (
                    <View key={request.id} className="rounded-lg bg-surface-high px-3 py-3">
                      <Text className="font-uiBold text-sm text-neutral-on-surface">{request.profiles?.full_name ?? request.profiles?.username ?? 'Jugador'}</Text>
                      <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">@{request.profiles?.username ?? 'sin_usuario'}</Text>
                      <View className="mt-2 flex-row items-center justify-between">
                        <Text className="font-ui text-[11px] text-neutral-on-surface-variant">{new Date(request.created_at).toLocaleDateString('es-AR')}</Text>
                        <Text className={`font-uiBold rounded px-2 py-1 text-[10px] uppercase tracking-wide ${chip.className}`}>{chip.label}</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>

      <Modal transparent animationType="fade" visible={showEditTeamModal} onRequestClose={() => setShowEditTeamModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowEditTeamModal(false)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-6">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-5">
                <Text className="font-display mb-4 text-lg text-neutral-on-surface">Editar equipo</Text>

                <Text className="font-display mb-2 text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">Nombre</Text>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Nombre del equipo"
                  placeholderTextColor="#5E5A58"
                  className="rounded-lg border border-neutral-outline-variant/15 bg-surface-low px-3 py-3 text-neutral-on-surface"
                  maxLength={36}
                />

                <Text className="font-display mb-2 mt-4 text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">Zona</Text>
                <TouchableOpacity onPress={() => setShowZonePicker(true)} activeOpacity={0.9} className="rounded-lg border border-neutral-outline-variant/15 bg-surface-low px-3 py-3">
                  <View className="flex-row items-center justify-between">
                    <Text className={editZone ? 'text-neutral-on-surface' : 'text-surface-bright'}>{editZone || 'Selecciona una zona'}</Text>
                    {loadingZones ? (
                      <ActivityIndicator size="small" color="#53E076" />
                    ) : (
                      <AppIcon family="material-icons" name="keyboard-arrow-down" size={20} color="#BCCBB9" />
                    )}
                  </View>
                </TouchableOpacity>

                <Text className="font-display mb-2 mt-4 text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">Categoria</Text>
                <View className="mb-4 flex-row flex-wrap gap-2">
                  {TEAM_CATEGORY_OPTIONS.map((option) => {
                    const active = editCategory === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        activeOpacity={0.9}
                        onPress={() => setEditCategory(option.value)}
                        className={`rounded-md border px-3 py-2 ${active ? 'border-brand-primary bg-brand-primary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                      >
                        <Text className={`font-display text-[10px] uppercase tracking-wide ${active ? 'text-brand-primary' : 'text-neutral-on-surface-variant'}`}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text className="font-display mb-2 text-[10px] uppercase tracking-wide text-neutral-on-surface-variant">Formato</Text>
                <View className="flex-row flex-wrap gap-2">
                  {TEAM_FORMAT_OPTIONS.map((option) => {
                    const active = editFormat === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        activeOpacity={0.9}
                        onPress={() => setEditFormat(option.value)}
                        className={`rounded-md border px-3 py-2 ${active ? 'border-info-secondary bg-info-secondary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                      >
                        <Text className={`font-display text-[10px] uppercase tracking-wide ${active ? 'text-info-secondary' : 'text-neutral-on-surface-variant'}`}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View className="mt-5 flex-row gap-2">
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setShowEditTeamModal(false)} className="flex-1 items-center rounded-lg bg-surface-low py-3">
                    <Text className="font-display text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.9}
                    disabled={savingTeam}
                    onPress={handleSaveTeam}
                    className={`flex-1 items-center rounded-lg py-3 ${savingTeam ? 'bg-brand-primary/45' : 'bg-brand-primary'}`}
                  >
                    {savingTeam ? (
                      <ActivityIndicator size="small" color="#003914" />
                    ) : (
                      <Text className="font-display text-[11px] uppercase tracking-wide text-[#003914]">Guardar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal transparent animationType="fade" visible={showZonePicker} onRequestClose={() => setShowZonePicker(false)}>
        <TouchableWithoutFeedback onPress={() => setShowZonePicker(false)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-6">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-4">
                <Text className="font-display mb-3 text-lg text-neutral-on-surface">Selecciona una zona</Text>

                {loadingZones ? (
                  <View className="py-6">
                    <ActivityIndicator size="small" color="#53E076" />
                  </View>
                ) : (
                  <FlatList
                    data={zones}
                    keyExtractor={(item) => item}
                    style={{ maxHeight: 320 }}
                    ItemSeparatorComponent={() => <View className="h-2" />}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => {
                          setEditZone(item);
                          setShowZonePicker(false);
                        }}
                        className={`rounded-lg border px-3 py-3 ${editZone === item ? 'border-brand-primary bg-brand-primary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                      >
                        <Text className={`font-ui ${editZone === item ? 'text-brand-primary' : 'text-neutral-on-surface'}`}>{item}</Text>
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={() => <Text className="py-2 text-sm text-neutral-on-surface-variant">No hay zonas activas disponibles.</Text>}
                  />
                )}

                <TouchableOpacity onPress={() => setShowZonePicker(false)} activeOpacity={0.9} className="mt-4 items-center rounded-lg bg-surface-low py-3">
                  <Text className="font-display text-xs uppercase tracking-wider text-neutral-on-surface-variant">Cerrar</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal transparent animationType="fade" visible={showRoleModal} onRequestClose={() => setShowRoleModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowRoleModal(false)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-6">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-5">
                <Text className="font-display mb-4 text-lg text-neutral-on-surface">Seleccionar rol</Text>
                <Text className="font-ui mb-3 text-xs text-neutral-on-surface-variant">Miembro: {memberForRoleUpdate?.profiles?.full_name ?? memberForRoleUpdate?.profiles?.username ?? 'Jugador'}</Text>

                <View className="gap-2">
                  {allowedRoleOptions.map((role) => {
                    const active = selectedRoleToAssign === role;
                    return (
                      <TouchableOpacity
                        key={role}
                        activeOpacity={0.9}
                        onPress={() => setSelectedRoleToAssign(role)}
                        className={`rounded-lg border px-3 py-3 ${active ? 'border-brand-primary bg-brand-primary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                      >
                        <Text className={`font-uiBold text-sm ${active ? 'text-brand-primary' : 'text-neutral-on-surface'}`}>{getTeamRoleLabel(role)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View className="mt-5 flex-row gap-2">
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setShowRoleModal(false)}
                    className="flex-1 items-center rounded-lg bg-surface-low py-3"
                  >
                    <Text className="font-display text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.9}
                    disabled={!!processingMemberId}
                    onPress={handleConfirmRoleChange}
                    className={`flex-1 items-center rounded-lg py-3 ${processingMemberId ? 'bg-brand-primary/45' : 'bg-brand-primary'}`}
                  >
                    {processingMemberId ? (
                      <ActivityIndicator size="small" color="#003914" />
                    ) : (
                      <Text className="font-display text-[11px] uppercase tracking-wide text-[#003914]">Guardar rol</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal transparent animationType="fade" visible={showRemoveConfirmModal} onRequestClose={() => setShowRemoveConfirmModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowRemoveConfirmModal(false)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-6">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-5">
                <Text className="font-display mb-2 text-lg text-neutral-on-surface">Confirmar remocion</Text>
                <Text className="font-ui text-sm text-neutral-on-surface-variant">
                  Vas a remover a {memberForRemove?.profiles?.full_name ?? memberForRemove?.profiles?.username ?? 'este miembro'} del equipo.
                </Text>

                <View className="mt-5 flex-row gap-2">
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setShowRemoveConfirmModal(false)}
                    className="flex-1 items-center rounded-lg bg-surface-low py-3"
                  >
                    <Text className="font-display text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.9}
                    disabled={!!processingMemberId}
                    onPress={handleConfirmRemoveMember}
                    className={`flex-1 items-center rounded-lg py-3 ${processingMemberId ? 'bg-danger-error/35' : 'bg-danger-error/80'}`}
                  >
                    {processingMemberId ? (
                      <ActivityIndicator size="small" color="#1A0E0D" />
                    ) : (
                      <Text className="font-display text-[11px] uppercase tracking-wide text-[#1A0E0D]">Remover</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal transparent animationType="fade" visible={showTransferCaptainModal} onRequestClose={() => setShowTransferCaptainModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowTransferCaptainModal(false)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-6">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-5">
                <Text className="font-display mb-2 text-lg text-neutral-on-surface">Transferir capitania</Text>
                <Text className="font-ui text-sm text-neutral-on-surface-variant">
                  Selecciona quien sera el nuevo capitan antes de abandonar el equipo.
                </Text>

                <View className="mt-4 gap-2">
                  {transferableCaptainCandidates.map((member) => {
                    const selected = transferCaptainToProfileId === member.profile_id;
                    return (
                      <TouchableOpacity
                        key={member.profile_id}
                        activeOpacity={0.9}
                        onPress={() => setTransferCaptainToProfileId(member.profile_id)}
                        className={`rounded-lg border px-3 py-3 ${selected ? 'border-info-secondary bg-info-secondary/15' : 'border-neutral-outline-variant/15 bg-surface-low'}`}
                      >
                        <View className="flex-row items-center justify-between">
                          <View>
                            <Text className={`font-uiBold text-sm ${selected ? 'text-info-secondary' : 'text-neutral-on-surface'}`}>
                              {member.profiles?.full_name ?? member.profiles?.username ?? 'Jugador'}
                            </Text>
                            <Text className="font-ui mt-1 text-xs text-neutral-on-surface-variant">
                              @{member.profiles?.username ?? 'sin_usuario'}
                            </Text>
                          </View>
                          <Text className="font-uiBold rounded bg-brand-primary/15 px-2 py-1 text-[10px] uppercase tracking-wide text-brand-primary">
                            {getTeamRoleLabel(member.role)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View className="mt-5 flex-row gap-2">
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setShowTransferCaptainModal(false)}
                    className="flex-1 items-center rounded-lg bg-surface-low py-3"
                  >
                    <Text className="font-display text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.9}
                    disabled={!transferCaptainToProfileId || processingMemberId === profile?.id}
                    onPress={handleConfirmTransferCaptainAndLeave}
                    className={`flex-1 items-center rounded-lg py-3 ${processingMemberId === profile?.id ? 'bg-info-secondary/35' : 'bg-info-secondary/80'}`}
                  >
                    {processingMemberId === profile?.id ? (
                      <ActivityIndicator size="small" color="#001F2B" />
                    ) : (
                      <Text className="font-display text-[11px] uppercase tracking-wide text-[#001F2B]">Transferir y salir</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal transparent animationType="fade" visible={showLeaveConfirmModal} onRequestClose={() => setShowLeaveConfirmModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowLeaveConfirmModal(false)}>
          <View className="flex-1 items-center justify-center bg-black/80 px-6">
            <TouchableWithoutFeedback>
              <View className="w-full max-w-sm rounded-2xl border border-neutral-outline-variant/15 bg-surface-high p-5">
                <Text className="font-display mb-2 text-lg text-neutral-on-surface">Abandonar equipo</Text>
                <Text className="font-ui text-sm text-neutral-on-surface-variant">Vas a salir de este equipo y perderas acceso a su gestion.</Text>

                <View className="mt-5 flex-row gap-2">
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => setShowLeaveConfirmModal(false)}
                    className="flex-1 items-center rounded-lg bg-surface-low py-3"
                  >
                    <Text className="font-display text-[11px] uppercase tracking-wide text-neutral-on-surface-variant">Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.9}
                    disabled={processingMemberId === profile?.id}
                    onPress={handleConfirmLeaveTeam}
                    className={`flex-1 items-center rounded-lg py-3 ${processingMemberId === profile?.id ? 'bg-danger-error/35' : 'bg-danger-error/80'}`}
                  >
                    {processingMemberId === profile?.id ? (
                      <ActivityIndicator size="small" color="#1A0E0D" />
                    ) : (
                      <Text className="font-display text-[11px] uppercase tracking-wide text-[#1A0E0D]">Abandonar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <CustomAlert visible={alertVisible} title={alertTitle} message={alertMessage} onClose={() => setAlertVisible(false)} />
    </SafeAreaView>
  );
}
