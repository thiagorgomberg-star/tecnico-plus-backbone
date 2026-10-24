// Exclusão com dupla confirmação para os cadastros do painel.
// Devolve true se apagou. Itens em uso por outros registros não podem ser apagados (o banco recusa): sugere desativar.
export async function excluirComConfirmacao(descricao: string, apagar: () => PromiseLike<{ error: { message: string; code?: string } | null }>) {
  if (!confirm(`Excluir ${descricao}? Não dá para desfazer.`)) return false;
  if (prompt("Para confirmar, digite EXCLUIR:")?.trim().toUpperCase() !== "EXCLUIR") {
    alert("Nada foi excluído.");
    return false;
  }
  const { error } = await apagar();
  if (error) {
    alert(error.code === "23503"
      ? "Não dá para excluir: este item já foi usado em O.S. ou outros registros. Use Desativar para tirá-lo das listas."
      : error.message);
    return false;
  }
  return true;
}
