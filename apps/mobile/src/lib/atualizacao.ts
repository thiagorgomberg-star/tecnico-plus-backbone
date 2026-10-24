import * as Updates from 'expo-updates';

// Versão deste APK (número do build no GitHub Actions; 0 quando rodando em desenvolvimento).
export const VERSAO_APP = Number(process.env.EXPO_PUBLIC_VERSAO_APP ?? 0);

const REPO = 'thiagorgomberg-star/tecnico-plus-backbone';
export const LINK_APK = `https://github.com/${REPO}/releases/latest/download/tecnico-plus.apk`;

// Número da versão publicada mais recente, ou null sem internet.
export async function versaoPublicada(): Promise<number | null> {
  try {
    const resposta = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!resposta.ok) return null;
    const { tag_name } = await resposta.json();
    const numero = Number(String(tag_name).replace('apk-', ''));
    return Number.isFinite(numero) ? numero : null;
  } catch {
    return null;
  }
}

// Atualização pelo ar (Expo): ao abrir o app, baixa a versão nova do código, se houver, e reinicia na hora.
// Mudanças nativas (biblioteca nova, permissão) continuam exigindo APK novo.
export async function aplicarAtualizacaoOta() {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const { isAvailable } = await Updates.checkForUpdateAsync();
    if (!isAvailable) return;
    const { isNew } = await Updates.fetchUpdateAsync();
    if (isNew) await Updates.reloadAsync();
  } catch {
    // sem internet: tenta de novo na próxima abertura
  }
}
