// Formatação do WhatsApp nos textos da O.S.: *negrito* ou **negrito**, _itálico_, ~riscado~.
const MARCAS = /(\*\*\S(?:[^*\n]*\S)?\*\*|\*\S(?:[^*\n]*\S)?\*|_\S(?:[^_\n]*\S)?_|~\S(?:[^~\n]*\S)?~)/;

export default function TextoNegrito({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(MARCAS).map((p, i) => {
        if (!(i % 2)) return p;
        if (p.startsWith("**") && p.length > 4) return <b key={i}>{p.slice(2, -2)}</b>;
        if (p[0] === "*") return <b key={i}>{p.slice(1, -1)}</b>;
        if (p[0] === "_") return <i key={i}>{p.slice(1, -1)}</i>;
        return <s key={i}>{p.slice(1, -1)}</s>;
      })}
    </>
  );
}
