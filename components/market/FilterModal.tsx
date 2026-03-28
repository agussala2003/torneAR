import React, { useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { AppIcon } from '@/components/ui/AppIcon';
import { HeroButton } from '@/components/ui/HeroButton';
import { fetchZones } from '@/lib/team-create-data';
import { MarketSortBy, TabType } from './types';

const DAYS_OF_WEEK = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
];

interface FilterModalProps {
  visible: boolean;
  activeTab: TabType;
  zone: string | null;
  selectedDays: string[];
  sortBy: MarketSortBy;
  onApply: (zone: string | null, days: string[], sortBy: MarketSortBy) => void;
  onClose: () => void;
}

export function FilterModal({
  visible,
  activeTab,
  zone,
  selectedDays,
  sortBy,
  onApply,
  onClose,
}: FilterModalProps) {
  const [localZone, setLocalZone] = useState<string | null>(zone);
  const [localDays, setLocalDays] = useState<string[]>(selectedDays);
  const [localSortBy, setLocalSortBy] = useState<MarketSortBy>(sortBy);
  const [zones, setZones] = useState<string[]>([]);

  // Initialize local state from props when modal opens
  useEffect(() => {
    if (visible) {
      setLocalZone(zone);
      setLocalDays(selectedDays);
      setLocalSortBy(sortBy);
    }
  }, [visible, zone, selectedDays, sortBy]);

  // Fetch zones once on mount
  useEffect(() => {
    fetchZones().then((fetched) => setZones(fetched));
  }, []);

  function toggleDay(day: string) {
    setLocalDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  function handleApply() {
    onApply(localZone, localDays, localSortBy);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      {/* Overlay */}
      <View className="flex-1 justify-end bg-black/60">
        {/* Bottom sheet panel */}
        <View className="bg-surface-container rounded-t-3xl max-h-[85%]">
          {/* Header */}
          <View className="flex-row items-center justify-between px-5 pt-5 pb-4">
            <Text className="text-neutral-on-surface text-xl font-semibold">
              Filtros
            </Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7} className="p-1">
              <AppIcon family="material-icons" name="close" size={20} color="#E5E2E1" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {/* Zone Section */}
            <View className="px-5 mb-6">
              <Text className="text-neutral-on-surface-variant text-sm font-medium mb-3 uppercase tracking-wider">
                Zona
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {/* "Cualquiera" chip */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setLocalZone(null)}
                  className={`px-4 py-2 rounded-full border ${
                    localZone === null
                      ? 'bg-brand-primary border-brand-primary'
                      : 'bg-surface-high border-surface-high'
                  }`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      localZone === null ? 'text-black' : 'text-neutral-on-surface'
                    }`}
                  >
                    Cualquiera
                  </Text>
                </TouchableOpacity>

                {zones.map((z) => {
                  const isSelected = localZone === z;
                  return (
                    <TouchableOpacity
                      key={z}
                      activeOpacity={0.7}
                      onPress={() => setLocalZone(z)}
                      className={`px-4 py-2 rounded-full border ${
                        isSelected
                          ? 'bg-brand-primary border-brand-primary'
                          : 'bg-surface-high border-surface-high'
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          isSelected ? 'text-black' : 'text-neutral-on-surface'
                        }`}
                      >
                        {z}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Day Section — only for TEAMS_LOOKING */}
            {activeTab === 'TEAMS_LOOKING' && (
              <View className="px-5 mb-6">
                <Text className="text-neutral-on-surface-variant text-sm font-medium mb-3 uppercase tracking-wider">
                  Día del partido
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day) => {
                    const isSelected = localDays.includes(day);
                    return (
                      <TouchableOpacity
                        key={day}
                        activeOpacity={0.7}
                        onPress={() => toggleDay(day)}
                        className={`px-4 py-2 rounded-full border ${
                          isSelected
                            ? 'bg-brand-primary border-brand-primary'
                            : 'bg-surface-high border-surface-high'
                        }`}
                      >
                        <Text
                          className={`text-sm font-medium ${
                            isSelected ? 'text-black' : 'text-neutral-on-surface'
                          }`}
                        >
                          {day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Sort Section */}
            <View className="px-5 mb-6">
              <Text className="text-neutral-on-surface-variant text-sm font-medium mb-3 uppercase tracking-wider">
                Ordenar por
              </Text>
              <View className="gap-2">
                {/* Recent option */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setLocalSortBy('recent')}
                  className={`flex-row items-center px-4 py-3 rounded-xl border ${
                    localSortBy === 'recent'
                      ? 'border-brand-primary bg-surface-high'
                      : 'border-surface-high bg-surface-high'
                  }`}
                >
                  {/* Radio circle */}
                  <View
                    className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                      localSortBy === 'recent' ? 'border-brand-primary' : 'border-neutral-on-surface-variant'
                    }`}
                  >
                    {localSortBy === 'recent' && (
                      <View className="w-2.5 h-2.5 rounded-full bg-brand-primary" />
                    )}
                  </View>
                  <Text className="text-neutral-on-surface text-base">
                    Más reciente
                  </Text>
                </TouchableOpacity>

                {/* Nearest option */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setLocalSortBy('nearest')}
                  className={`flex-row items-center px-4 py-3 rounded-xl border ${
                    localSortBy === 'nearest'
                      ? 'border-brand-primary bg-surface-high'
                      : 'border-surface-high bg-surface-high'
                  }`}
                >
                  <View
                    className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                      localSortBy === 'nearest' ? 'border-brand-primary' : 'border-neutral-on-surface-variant'
                    }`}
                  >
                    {localSortBy === 'nearest' && (
                      <View className="w-2.5 h-2.5 rounded-full bg-brand-primary" />
                    )}
                  </View>
                  <Text className="text-neutral-on-surface text-base">
                    Partido más cercano
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Apply Button */}
            <View className="px-5">
              <HeroButton label="Aplicar Filtros" onPress={handleApply} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
