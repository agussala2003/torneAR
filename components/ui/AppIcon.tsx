import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

type IconFamily = 'ionicons' | 'material-community' | 'material-icons';

type AppIconProps = {
  family?: IconFamily;
  name: string;
  size?: number;
  color?: string;
};

export function AppIcon({ family = 'material-community', name, size = 22, color = '#E5E2E1' }: AppIconProps) {
  if (family === 'material-community') {
    return <MaterialCommunityIcons name={name as never} size={size} color={color} />;
  }

  if (family === 'ionicons') {
    return <Ionicons name={name as never} size={size} color={color} />;
  }

  if (family === 'material-icons') {
    return <MaterialIcons name={name as never} size={size} color={color} />;
  }

  return <MaterialCommunityIcons name={name as never} size={size} color={color} />;
}
