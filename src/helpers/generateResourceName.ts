function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]+/) // Split on hyphens, underscores, and spaces
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

function generateResourceName(name: string): string {
  const pascalName = toPascalCase(name);
  if (pascalName.toLowerCase().endsWith("function")) {
    return pascalName;
  }
  return `${pascalName}Function`;
}

export { generateResourceName };
