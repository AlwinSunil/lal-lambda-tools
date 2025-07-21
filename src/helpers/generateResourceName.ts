function toPascalCase(name: string): string {
  return name
    .split(/[-_\s]+/) // Split on hyphens, underscores, and spaces
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function generateResourceName(name: string): string {
  return toPascalCase(name);
}

export { generateResourceName };
