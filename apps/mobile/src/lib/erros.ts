import { randomUUID } from 'expo-crypto';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

import { enfileirar } from './fila';
import { supabase } from './supabase';

// Erro do app vai sozinho para o servidor (pela fila, chega mesmo se estiver sem sinal), para corrigir sem print.
// Mesmo erro repetido em seguida só é registrado uma vez.
let ultimo = '';
export async function registrarErro(erro: unknown, fatal = false) {
  try {
    const e = erro instanceof Error ? erro : new Error(String(erro));
    const chave = `${e.message}|${(e.stack ?? '').slice(0, 200)}`;
    if (chave === ultimo) return;
    ultimo = chave;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
    await enfileirar({
      tipo: 'inserir', tabela: 'app_erros',
      linha: {
        id: randomUUID(), usuario_id: data.session.user.id, mensagem: e.message.slice(0, 1000), pilha: (e.stack ?? '').slice(0, 4000), fatal,
        versao: `runtime ${Updates.runtimeVersion ?? '?'} · OTA ${Updates.updateId?.slice(0, 8) ?? 'embutida'}`,
        aparelho: `${Platform.OS} ${Platform.Version} · ${String((Platform.constants as { Model?: string }).Model ?? '')}`,
      },
    });
  } catch {
    // registrar o erro nunca pode derrubar o app
  }
}

// Pega os erros não tratados do JavaScript (inclusive os que fecham o app) e manda registrar.
export function vigiarErros() {
  const global = globalThis as unknown as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, f?: boolean) => void; setGlobalHandler: (h: (e: unknown, f?: boolean) => void) => void } };
  const utils = global.ErrorUtils;
  if (!utils) return;
  const anterior = utils.getGlobalHandler();
  utils.setGlobalHandler((e, fatal) => {
    registrarErro(e, !!fatal);
    anterior(e, fatal);
  });
}
