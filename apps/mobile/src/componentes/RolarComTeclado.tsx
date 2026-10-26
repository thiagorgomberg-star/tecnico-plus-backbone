import { ComponentRef, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Dimensions, Keyboard, NativeScrollEvent, NativeSyntheticEvent, ScrollView, ScrollViewProps, TextInput, View } from 'react-native';

const MARGEM = 24;
type Medivel = { measureInWindow: (cb: (x: number, y: number, largura: number, altura: number) => void) => void };

// ScrollView que não deixa o teclado cobrir o campo em digitação: abre espaço no fim do conteúdo
// do tamanho do teclado e rola até o campo focado ficar acima dele (no Android edge-to-edge a tela
// não encolhe sozinha quando o teclado abre).
const RolarComTeclado = forwardRef<ComponentRef<typeof ScrollView>, ScrollViewProps>(function RolarComTeclado({ children, onScroll, onTouchStart, onTouchEnd, ...props }, ref) {
  const rolagem = useRef<ComponentRef<typeof ScrollView>>(null);
  useImperativeHandle(ref, () => rolagem.current as ComponentRef<typeof ScrollView>);
  const deslocamento = useRef(0);
  const topoTeclado = useRef<number | null>(null);
  // Só reage se o campo foi tocado aqui (evita rolar a tela de baixo quando o campo está num modal).
  const ultimoToque = useRef(0);
  const [alturaTeclado, setAlturaTeclado] = useState(0);

  function mostrarCampo() {
    const campo = TextInput.State.currentlyFocusedInput?.() as unknown as Medivel | null;
    const limite = topoTeclado.current;
    if (!campo || limite == null || !rolagem.current) return;
    campo.measureInWindow((_x, y, _l, altura) => {
      const excesso = y + altura + MARGEM - limite;
      if (excesso > 0) rolagem.current?.scrollTo({ y: deslocamento.current + excesso, animated: true });
    });
  }

  useEffect(() => {
    const abriu = Keyboard.addListener('keyboardDidShow', (e) => {
      const tela = Dimensions.get('window').height;
      topoTeclado.current = Math.min(e.endCoordinates.screenY, tela);
      setAlturaTeclado(e.endCoordinates.height);
      if (Date.now() - ultimoToque.current < 2000) setTimeout(mostrarCampo, 60);
    });
    const fechou = Keyboard.addListener('keyboardDidHide', () => {
      topoTeclado.current = null;
      setAlturaTeclado(0);
    });
    return () => { abriu.remove(); fechou.remove(); };
  }, []);

  return (
    <ScrollView
      ref={rolagem}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={32}
      {...props}
      onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => { deslocamento.current = e.nativeEvent.contentOffset.y; onScroll?.(e); }}
      // Trocar de campo com o teclado já aberto não dispara keyboardDidShow de novo.
      onTouchStart={(e) => { ultimoToque.current = Date.now(); onTouchStart?.(e); }}
      onTouchEnd={(e) => { onTouchEnd?.(e); if (topoTeclado.current != null) setTimeout(mostrarCampo, 120); }}
    >
      {children}
      {alturaTeclado ? <View style={{ height: alturaTeclado }} /> : null}
    </ScrollView>
  );
});

export default RolarComTeclado;

// Altura do teclado aberto (0 fechado), para levantar rodapés e telas sem rolagem.
export function useAlturaTeclado() {
  const [altura, setAltura] = useState(0);
  useEffect(() => {
    const abriu = Keyboard.addListener('keyboardDidShow', (e) => setAltura(e.endCoordinates.height));
    const fechou = Keyboard.addListener('keyboardDidHide', () => setAltura(0));
    return () => { abriu.remove(); fechou.remove(); };
  }, []);
  return altura;
}
