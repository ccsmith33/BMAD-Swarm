/**
 * Get a nested value from an object using dot notation.
 * @param {object} obj
 * @param {string} path
 * @returns {*}
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    if (current === undefined || current === null) return undefined;
    return current[key];
  }, obj);
}

/**
 * Find matching closing tag, handling nesting.
 * @param {string} template
 * @param {string} openTag - e.g. '{{#if'
 * @param {string} closeTag - e.g. '{{/if}}'
 * @param {number} startPos - position after the opening tag
 * @returns {number} position of the matching close tag, or -1
 */
function findMatchingClose(template, openTag, closeTag, startPos) {
  let depth = 1;
  let pos = startPos;
  while (pos < template.length && depth > 0) {
    const nextOpen = template.indexOf(openTag, pos);
    const nextClose = template.indexOf(closeTag, pos);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      pos = nextClose + closeTag.length;
    }
  }
  return -1;
}

/**
 * Process {{#unless key}}...{{/unless}} blocks.
 */
function processUnless(template, data) {
  const regex = /\{\{#unless\s+([^}]+)\}\}/g;
  let result = template;
  let match;
  while ((match = regex.exec(result)) !== null) {
    const key = match[1].trim();
    const startPos = match.index;
    const afterOpen = startPos + match[0].length;
    const closePos = findMatchingClose(result, '{{#unless', '{{/unless}}', afterOpen);
    if (closePos === -1) break;
    const content = result.slice(afterOpen, closePos);
    const value = getNestedValue(data, key);
    const replacement = value ? '' : processTemplate(content, data);
    result = result.slice(0, startPos) + replacement + result.slice(closePos + '{{/unless}}'.length);
    regex.lastIndex = startPos + replacement.length;
  }
  return result;
}

/**
 * Process {{#each array}}...{{/each}} blocks.
 */
function processEach(template, data) {
  const regex = /\{\{#each\s+([^}]+)\}\}/g;
  let result = template;
  let match;
  while ((match = regex.exec(result)) !== null) {
    const key = match[1].trim();
    const startPos = match.index;
    const afterOpen = startPos + match[0].length;
    const closePos = findMatchingClose(result, '{{#each', '{{/each}}', afterOpen);
    if (closePos === -1) break;
    const content = result.slice(afterOpen, closePos);
    const arr = getNestedValue(data, key);
    let replacement = '';
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (typeof item === 'object' && item !== null) {
          replacement += processTemplate(content, { ...data, ...item, this: item });
        } else {
          replacement += processTemplate(content.replace(/\{\{this\}\}/g, String(item)), data);
        }
      }
    }
    result = result.slice(0, startPos) + replacement + result.slice(closePos + '{{/each}}'.length);
    regex.lastIndex = startPos + replacement.length;
  }
  return result;
}

/**
 * Process {{#if key}}...{{#else}}...{{/if}} and {{#if key}}...{{/if}} blocks.
 * Handles nesting correctly.
 */
function processConditionals(template, data) {
  const regex = /\{\{#if\s+([^}]+)\}\}/g;
  let result = template;
  let match;
  while ((match = regex.exec(result)) !== null) {
    const key = match[1].trim();
    const startPos = match.index;
    const afterOpen = startPos + match[0].length;
    const closePos = findMatchingClose(result, '{{#if', '{{/if}}', afterOpen);
    if (closePos === -1) break;
    const fullContent = result.slice(afterOpen, closePos);
    const value = getNestedValue(data, key);

    // Find {{#else}} at the same nesting depth
    let elsePos = -1;
    let depth = 0;
    for (let i = 0; i < fullContent.length; i++) {
      if (fullContent.startsWith('{{#if', i)) {
        depth++;
      } else if (fullContent.startsWith('{{/if}}', i)) {
        depth--;
      } else if (fullContent.startsWith('{{#else}}', i) && depth === 0) {
        elsePos = i;
        break;
      }
    }

    let replacement;
    if (elsePos !== -1) {
      const trueBlock = fullContent.slice(0, elsePos);
      const falseBlock = fullContent.slice(elsePos + '{{#else}}'.length);
      replacement = value ? processTemplate(trueBlock, data) : processTemplate(falseBlock, data);
    } else {
      replacement = value ? processTemplate(fullContent, data) : '';
    }

    result = result.slice(0, startPos) + replacement + result.slice(closePos + '{{/if}}'.length);
    regex.lastIndex = startPos + replacement.length;
  }
  return result;
}

/**
 * Replace {{key}} placeholders with values from data.
 */
function replacePlaceholders(template, data) {
  return template.replace(/\{\{([^#/][^}]*)\}\}/g, (match, key) => {
    const trimmedKey = key.trim();
    const value = getNestedValue(data, trimmedKey);
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

/**
 * Process all template directives in order.
 */
function processTemplate(template, data) {
  let result = template;
  result = processEach(result, data);
  result = processConditionals(result, data);
  result = processUnless(result, data);
  result = replacePlaceholders(result, data);
  return result;
}

/**
 * Simple template engine using {{placeholder}} syntax.
 * @param {string} template
 * @param {object} data
 * @returns {string}
 */
export function renderTemplate(template, data) {
  return replacePlaceholders(template, data);
}

/**
 * Render conditional blocks.
 * @param {string} template
 * @param {object} data
 * @returns {string}
 */
export function renderConditionals(template, data) {
  return processConditionals(template, data);
}

/**
 * Full template render.
 * @param {string} template
 * @param {object} data
 * @returns {string}
 */
export function render(template, data) {
  return processTemplate(template, data);
}
