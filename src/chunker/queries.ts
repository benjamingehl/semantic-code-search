import type Parser from 'web-tree-sitter';

type Node = Parser.SyntaxNode;

const definitionTypes = new Set([
  'function_declaration',
  'generator_function_declaration',
  'function_definition',
  'function_item',
  'method_definition',
  'method_declaration',
  'constructor_declaration',
  'method',
  'singleton_method',
  'class',
  'class_declaration',
  'abstract_class_declaration',
  'class_definition',
  'class_specifier',
  'struct_item',
  'struct_specifier',
  'struct_declaration',
  'enum_item',
  'enum_specifier',
  'enum_declaration',
  'union_specifier',
  'interface_declaration',
  'trait_item',
  'trait_declaration',
  'trait_definition',
  'protocol_declaration',
  'record_declaration',
  'impl_item',
  'mod_item',
  'module',
  'namespace_definition',
  'object_declaration',
  'object_definition',
  'macro_definition',
  'type_spec',
]);

const identifierTypes = new Set([
  'identifier',
  'type_identifier',
  'simple_identifier',
  'field_identifier',
  'qualified_identifier',
]);

const nameOf = (node: Node): string => {
  const named = node.childForFieldName('name') ?? (node.type === 'impl_item' ? node.childForFieldName('type') : null);
  if (named) return named.text;
  for (
    let declarator = node.childForFieldName('declarator');
    declarator;
    declarator = declarator.childForFieldName('declarator')
  ) {
    if (identifierTypes.has(declarator.type)) return declarator.text;
  }
  return node.namedChildren.find((child) => identifierTypes.has(child.type))?.text ?? '(anonymous)';
};

const functionValueTypes = new Set(['arrow_function', 'function', 'function_expression', 'generator_function']);

const variableSymbol = (node: Node): string | null => {
  if (node.type !== 'lexical_declaration' && node.type !== 'variable_declaration') return null;
  const declarator = node.namedChildren.find((child) => child.type === 'variable_declarator');
  const value = declarator?.childForFieldName('value');
  if (declarator && value && functionValueTypes.has(value.type)) {
    return declarator.childForFieldName('name')?.text ?? '(anonymous)';
  }
  return null;
};

export const definitionSymbol = (node: Node): string | null =>
  definitionTypes.has(node.type) ? nameOf(node) : variableSymbol(node);
