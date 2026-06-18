import type Parser from 'web-tree-sitter';

type Node = Parser.SyntaxNode;

const definitionTypes = new Set([
  'function_declaration',
  'generator_function_declaration',
  'method_definition',
  'class_declaration',
  'abstract_class_declaration',
  'function_definition',
  'class_definition',
]);

const functionValueTypes = new Set(['arrow_function', 'function', 'function_expression', 'generator_function']);

const nameOf = (node: Node): string => node.childForFieldName('name')?.text ?? '(anonymous)';

export const definitionSymbol = (node: Node): string | null => {
  if (definitionTypes.has(node.type)) return nameOf(node);

  if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
    const declarator = node.namedChildren.find((child) => child.type === 'variable_declarator');
    const value = declarator?.childForFieldName('value');
    if (declarator && value && functionValueTypes.has(value.type)) {
      return declarator.childForFieldName('name')?.text ?? '(anonymous)';
    }
  }

  return null;
};
