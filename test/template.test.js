import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderTemplate, renderConditionals, render } from '../utils/template.js';

describe('Template Engine', () => {
  describe('renderTemplate', () => {
    it('replaces simple placeholders', () => {
      const result = renderTemplate('Hello {{name}}!', { name: 'World' });
      assert.equal(result, 'Hello World!');
    });

    it('replaces nested placeholders', () => {
      const result = renderTemplate('{{project.name}} is {{project.type}}', {
        project: { name: 'MyApp', type: 'web-app' },
      });
      assert.equal(result, 'MyApp is web-app');
    });

    it('leaves unknown placeholders unchanged', () => {
      const result = renderTemplate('Hello {{unknown}}!', {});
      assert.equal(result, 'Hello {{unknown}}!');
    });

    it('handles multiple placeholders', () => {
      const result = renderTemplate('{{a}} and {{b}}', { a: '1', b: '2' });
      assert.equal(result, '1 and 2');
    });

    it('converts numbers to strings', () => {
      const result = renderTemplate('Count: {{count}}', { count: 42 });
      assert.equal(result, 'Count: 42');
    });
  });

  describe('renderConditionals', () => {
    it('includes block when condition is truthy', () => {
      const result = renderConditionals('{{#if show}}visible{{/if}}', { show: true });
      assert.equal(result, 'visible');
    });

    it('removes block when condition is falsy', () => {
      const result = renderConditionals('{{#if show}}hidden{{/if}}', { show: false });
      assert.equal(result, '');
    });

    it('removes block when condition is undefined', () => {
      const result = renderConditionals('before{{#if missing}}hidden{{/if}}after', {});
      assert.equal(result, 'beforeafter');
    });

    it('handles nested keys in conditions', () => {
      const result = renderConditionals('{{#if stack.framework}}has framework{{/if}}', {
        stack: { framework: 'React' },
      });
      assert.equal(result, 'has framework');
    });
  });

  describe('render (full)', () => {
    it('processes conditionals then placeholders', () => {
      const template = '{{project.name}}{{#if hasDb}} with {{stack.database}}{{/if}}';
      const result = render(template, {
        project: { name: 'MyApp' },
        hasDb: true,
        stack: { database: 'PostgreSQL' },
      });
      assert.equal(result, 'MyApp with PostgreSQL');
    });
  });

  describe('each blocks', () => {
    it('iterates over array of primitives', () => {
      const result = render('{{#each items}}[{{this}}]{{/each}}', { items: ['a', 'b', 'c'] });
      assert.equal(result, '[a][b][c]');
    });

    it('iterates over array of objects', () => {
      const result = render('{{#each items}}{{name}}:{{value}} {{/each}}', {
        items: [{ name: 'x', value: 1 }, { name: 'y', value: 2 }],
      });
      assert.equal(result, 'x:1 y:2 ');
    });

    it('renders nothing for empty array', () => {
      const result = render('before{{#each items}}item{{/each}}after', { items: [] });
      assert.equal(result, 'beforeafter');
    });

    it('renders nothing for undefined array', () => {
      const result = render('before{{#each items}}item{{/each}}after', {});
      assert.equal(result, 'beforeafter');
    });

    it('renders nothing for null array', () => {
      const result = render('before{{#each items}}item{{/each}}after', { items: null });
      assert.equal(result, 'beforeafter');
    });
  });

  describe('else blocks', () => {
    it('renders else block when condition is falsy', () => {
      const result = render('{{#if show}}yes{{#else}}no{{/if}}', { show: false });
      assert.equal(result, 'no');
    });

    it('renders if block when condition is truthy', () => {
      const result = render('{{#if show}}yes{{#else}}no{{/if}}', { show: true });
      assert.equal(result, 'yes');
    });

    it('renders else block when key is undefined', () => {
      const result = render('{{#if missing}}yes{{#else}}no{{/if}}', {});
      assert.equal(result, 'no');
    });
  });

  describe('unless blocks', () => {
    it('renders content when key is falsy', () => {
      const result = render('{{#unless hidden}}visible{{/unless}}', { hidden: false });
      assert.equal(result, 'visible');
    });

    it('hides content when key is truthy', () => {
      const result = render('{{#unless hidden}}visible{{/unless}}', { hidden: true });
      assert.equal(result, '');
    });

    it('renders content when key is undefined', () => {
      const result = render('{{#unless missing}}visible{{/unless}}', {});
      assert.equal(result, 'visible');
    });
  });

  describe('nested conditionals', () => {
    it('handles nested if blocks', () => {
      const result = render('{{#if a}}{{#if b}}both{{/if}}{{/if}}', { a: true, b: true });
      assert.equal(result, 'both');
    });

    it('handles nested if with outer false', () => {
      const result = render('{{#if a}}{{#if b}}both{{/if}}{{/if}}', { a: false, b: true });
      assert.equal(result, '');
    });

    it('handles conditionals inside each', () => {
      const result = render('{{#each items}}{{#if active}}[{{name}}]{{/if}}{{/each}}', {
        items: [{ name: 'a', active: true }, { name: 'b', active: false }, { name: 'c', active: true }],
      });
      assert.equal(result, '[a][c]');
    });
  });
});
