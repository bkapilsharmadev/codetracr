declare module 'tree-sitter-javascript' {
  const language: Parameters<import('tree-sitter')['prototype']['setLanguage']>[0];
  export default language;
}
