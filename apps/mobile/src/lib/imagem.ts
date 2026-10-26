import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// Foto mais leve antes de guardar/enviar (economiza dados móveis e o espaço do servidor):
// no máximo `largura` px no lado maior, JPEG com qualidade `qualidade`. Se falhar, segue com a original.
export async function reduzirFoto(uri: string, largura = 1600, qualidade = 0.7, dimensoes?: { width: number; height: number }) {
  try {
    const maior = dimensoes ? Math.max(dimensoes.width, dimensoes.height) : Infinity;
    const resize = maior > largura
      ? [{ resize: dimensoes!.width >= dimensoes!.height ? { width: largura } : { height: largura } }]
      : dimensoes ? [] : [{ resize: { width: largura } }];
    const r = await manipulateAsync(uri, resize, { compress: qualidade, format: SaveFormat.JPEG });
    return r.uri;
  } catch {
    return uri;
  }
}
