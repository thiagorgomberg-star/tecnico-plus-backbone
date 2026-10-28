import { Text, TextProps, TextStyle } from 'react-native';

// Formatação do WhatsApp nos textos da O.S.: *negrito* ou **negrito**, _itálico_, ~riscado~.
const MARCAS = /(\*\*\S(?:[^*\n]*\S)?\*\*|\*\S(?:[^*\n]*\S)?\*|_\S(?:[^_\n]*\S)?_|~\S(?:[^~\n]*\S)?~)/;
function estilo(p: string): [TextStyle, number] | null {
  if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return [{ fontWeight: '800' }, 2];
  if (p[0] === '*') return [{ fontWeight: '800' }, 1];
  if (p[0] === '_') return [{ fontStyle: 'italic' }, 1];
  if (p[0] === '~') return [{ textDecorationLine: 'line-through' }, 1];
  return null;
}

export default function TextoNegrito({ children, ...props }: TextProps & { children: string }) {
  const partes = children.split(MARCAS);
  return (
    <Text {...props}>
      {partes.map((p, i) => {
        const e = i % 2 ? estilo(p) : null;
        return e ? <Text key={i} style={e[0]}>{p.slice(e[1], -e[1])}</Text> : p;
      })}
    </Text>
  );
}
