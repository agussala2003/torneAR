import { TextInput, TouchableOpacity, View } from 'react-native';
import { AppIcon } from '@/components/ui/AppIcon';

interface Props {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
}

export function RivalSearchBar({ value, onChangeText, placeholder = 'Buscar equipo...' }: Props) {
    return (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl border border-brand-primary/30 bg-surface-container px-3 py-1.5">
            <AppIcon family="material-community" name="magnify" size={18} color="#869585" />
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor="#869585"
                className="flex-1 font-ui text-[13px] text-neutral-on-surface"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
            />
            {value.length > 0 && (
                <TouchableOpacity onPress={() => onChangeText('')} activeOpacity={0.7} className="p-1">
                    <AppIcon family="material-community" name="close" size={16} color="#869585" />
                </TouchableOpacity>
            )}
        </View>
    );
}