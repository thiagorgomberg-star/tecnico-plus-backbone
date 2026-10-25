import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ComponentProps } from 'react';

// Ícones do app (Material Community, o mesmo estilo de traço usado em apps de field service).
export type NomeIcone = ComponentProps<typeof MaterialCommunityIcons>['name'];
export const fonteIcones = MaterialCommunityIcons.font;

export default function Icone({ nome, tamanho = 20, cor, style }: { nome: NomeIcone; tamanho?: number; cor: string; style?: ComponentProps<typeof MaterialCommunityIcons>['style'] }) {
  return <MaterialCommunityIcons name={nome} size={tamanho} color={cor} style={style} />;
}

// Ícone de cada tipo de O.S.
export function iconeDoTipo(tipo: string): NomeIcone {
  if (/corretiva/i.test(tipo)) return 'flash-alert';
  if (/evento informado/i.test(tipo)) return 'alert-octagon-outline';
  if (/preventiva site/i.test(tipo)) return 'office-building-cog';
  if (/preventiva/i.test(tipo)) return 'shield-check';
  if (/roteamento/i.test(tipo)) return 'transit-connection-variant';
  if (/vistoria/i.test(tipo)) return 'binoculars';
  return 'clipboard-text';
}
