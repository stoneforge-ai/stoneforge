/**
 * CLI Formatter Tests
 */

import { describe, it, expect } from 'bun:test';
import {
  getFormatter,
  getOutputMode,
  getStatusIcon,
  STATUS_ICONS,
  type TreeNode,
} from './formatter.js';
import { success, failure } from './types.js';

describe('getOutputMode', () => {
  it('should return json mode when json flag is true', () => {
    expect(getOutputMode({ json: true })).toBe('json');
  });

  it('should return quiet mode when quiet flag is true', () => {
    expect(getOutputMode({ quiet: true })).toBe('quiet');
  });

  it('should return human mode by default', () => {
    expect(getOutputMode({})).toBe('human');
  });

  it('should prefer json over quiet', () => {
    expect(getOutputMode({ json: true, quiet: true })).toBe('json');
  });
});

describe('getFormatter', () => {
  it('should return human formatter', () => {
    const formatter = getFormatter('human');
    expect(formatter).toBeDefined();
    expect(typeof formatter.success).toBe('function');
    expect(typeof formatter.error).toBe('function');
  });

  it('should return json formatter', () => {
    const formatter = getFormatter('json');
    expect(formatter).toBeDefined();
  });

  it('should return quiet formatter', () => {
    const formatter = getFormatter('quiet');
    expect(formatter).toBeDefined();
  });
});

describe('Human Formatter', () => {
  const formatter = getFormatter('human');

  describe('success', () => {
    it('should return message when provided', () => {
      const result = success(undefined, 'Operation completed');
      expect(formatter.success(result)).toBe('Operation completed');
    });

    it('should format data when no message', () => {
      const result = success({ id: 'el-abc' });
      expect(formatter.success(result)).toContain('el-abc');
    });

    it('should return empty string when no data or message', () => {
      const result = success();
      expect(formatter.success(result)).toBe('');
    });
  });

  describe('error', () => {
    it('should prefix error message', () => {
      const result = failure('Something went wrong');
      expect(formatter.error(result)).toBe('Error: Something went wrong');
    });
  });

  describe('table', () => {
    it('should format table with headers and rows', () => {
      const output = formatter.table(
        ['ID', 'TITLE', 'STATUS'],
        [
          ['el-abc', 'First task', 'open'],
          ['el-xyz', 'Second task', 'closed'],
        ]
      );
      expect(output).toContain('ID');
      expect(output).toContain('TITLE');
      expect(output).toContain('STATUS');
      expect(output).toContain('el-abc');
      expect(output).toContain('First task');
      expect(output).toContain('---');
    });

    it('should return "No results" for empty rows', () => {
      const output = formatter.table(['ID', 'TITLE'], []);
      expect(output).toBe('No results');
    });

    it('should handle varying column widths', () => {
      const output = formatter.table(
        ['ID', 'TITLE'],
        [
          ['el-a', 'Short'],
          ['el-abc123456', 'A much longer title here'],
        ]
      );
      const lines = output.split('\n');
      // All lines should have consistent formatting
      expect(lines.length).toBe(4); // header, separator, 2 data rows
    });
  });

  describe('element', () => {
    it('should format element as key-value pairs', () => {
      const output = formatter.element({
        id: 'el-abc123',
        title: 'My Task',
        status: 'open',
      });
      expect(output).toContain('id');
      expect(output).toContain('el-abc123');
      expect(output).toContain('title');
      expect(output).toContain('My Task');
      expect(output).toContain('status');
      expect(output).toContain('open');
    });

    it('should handle null values', () => {
      const output = formatter.element({
        id: 'el-abc',
        assignee: null,
      });
      expect(output).toContain('-');
    });

    it('should handle array values', () => {
      const output = formatter.element({
        id: 'el-abc',
        tags: ['urgent', 'bug'],
      });
      expect(output).toContain('urgent, bug');
    });

    it('should handle empty array', () => {
      const output = formatter.element({
        id: 'el-abc',
        tags: [],
      });
      expect(output).toContain('-');
    });
  });

  describe('list', () => {
    it('should format list as table', () => {
      const output = formatter.list([
        { id: 'el-abc', title: 'First', status: 'open' },
        { id: 'el-xyz', title: 'Second', status: 'closed' },
      ]);
      expect(output).toContain('ID');
      expect(output).toContain('TITLE');
      expect(output).toContain('STATUS');
      expect(output).toContain('el-abc');
      expect(output).toContain('el-xyz');
    });

    it('should return "No results" for empty list', () => {
      const output = formatter.list([]);
      expect(output).toBe('No results');
    });

    it('should only show common display fields', () => {
      const output = formatter.list([
        { id: 'el-abc', title: 'Task', internalField: 'hidden' },
      ]);
      expect(output).toContain('ID');
      expect(output).not.toContain('internalField');
    });
  });

  describe('tree', () => {
    it('should format simple tree', () => {
      const tree: TreeNode = {
        label: 'Root',
        children: [
          { label: 'Child 1' },
          { label: 'Child 2' },
        ],
      };
      const output = formatter.tree(tree);
      expect(output).toContain('Root');
      expect(output).toContain('Child 1');
      expect(output).toContain('Child 2');
    });

    it('should format nested tree', () => {
      const tree: TreeNode = {
        label: 'Root',
        children: [
          {
            label: 'Parent',
            children: [
              { label: 'Child' },
            ],
          },
        ],
      };
      const output = formatter.tree(tree);
      expect(output).toContain('Root');
      expect(output).toContain('Parent');
      expect(output).toContain('Child');
    });

    it('should use tree connectors', () => {
      const tree: TreeNode = {
        label: 'Root',
        children: [
          { label: 'Child 1' },
          { label: 'Child 2' },
        ],
      };
      const output = formatter.tree(tree);
      expect(output).toContain('├──');
      expect(output).toContain('└──');
    });
  });
});

describe('JSON Formatter', () => {
  const formatter = getFormatter('json');

  describe('success', () => {
    it('should return JSON with success flag', () => {
      const result = success({ id: 'el-abc' });
      const output = formatter.success(result);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(true);
      expect(parsed.data).toEqual({ id: 'el-abc' });
    });
  });

  describe('error', () => {
    it('should return JSON with error info', () => {
      const result = failure('Not found', 3);
      const output = formatter.error(result);
      const parsed = JSON.parse(output);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Not found');
      expect(parsed.exitCode).toBe(3);
    });
  });

  describe('table', () => {
    it('should return JSON array', () => {
      const output = formatter.table(
        ['ID', 'TITLE'],
        [['el-abc', 'Task']]
      );
      const parsed = JSON.parse(output);
      expect(parsed).toEqual([['el-abc', 'Task']]);
    });
  });

  describe('element', () => {
    it('should return JSON object', () => {
      const output = formatter.element({ id: 'el-abc', title: 'Task' });
      const parsed = JSON.parse(output);
      expect(parsed).toEqual({ id: 'el-abc', title: 'Task' });
    });
  });

  describe('list', () => {
    it('should return JSON array of objects', () => {
      const output = formatter.list([
        { id: 'el-abc', title: 'First' },
        { id: 'el-xyz', title: 'Second' },
      ]);
      const parsed = JSON.parse(output);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].id).toBe('el-abc');
    });
  });

  describe('tree', () => {
    it('should return JSON tree structure', () => {
      const tree: TreeNode = { label: 'Root', children: [{ label: 'Child' }] };
      const output = formatter.tree(tree);
      const parsed = JSON.parse(output);
      expect(parsed.label).toBe('Root');
      expect(parsed.children[0].label).toBe('Child');
    });
  });
});

describe('Quiet Formatter', () => {
  const formatter = getFormatter('quiet');

  describe('success', () => {
    it('should return empty string for no data', () => {
      const result = success();
      expect(formatter.success(result)).toBe('');
    });

    it('should return string data directly', () => {
      const result = success('el-abc123');
      expect(formatter.success(result)).toBe('el-abc123');
    });

    it('should return ID from object', () => {
      const result = success({ id: 'el-abc123', title: 'Task' });
      expect(formatter.success(result)).toBe('el-abc123');
    });

    it('should return IDs from array', () => {
      const result = success([
        { id: 'el-abc' },
        { id: 'el-xyz' },
      ]);
      const output = formatter.success(result);
      expect(output).toBe('el-abc\nel-xyz');
    });
  });

  describe('error', () => {
    it('should return error message', () => {
      const result = failure('Something went wrong');
      expect(formatter.error(result)).toBe('Something went wrong');
    });
  });

  describe('table', () => {
    it('should return first column only', () => {
      const output = formatter.table(
        ['ID', 'TITLE'],
        [
          ['el-abc', 'First'],
          ['el-xyz', 'Second'],
        ]
      );
      expect(output).toBe('el-abc\nel-xyz');
    });
  });

  describe('element', () => {
    it('should return ID only', () => {
      const output = formatter.element({ id: 'el-abc123', title: 'Task' });
      expect(output).toBe('el-abc123');
    });

    it('should return empty for element without ID', () => {
      const output = formatter.element({ title: 'Task' });
      expect(output).toBe('');
    });
  });

  describe('list', () => {
    it('should return IDs only', () => {
      const output = formatter.list([
        { id: 'el-abc', title: 'First' },
        { id: 'el-xyz', title: 'Second' },
      ]);
      expect(output).toBe('el-abc\nel-xyz');
    });
  });

  describe('tree', () => {
    it('should flatten tree to labels', () => {
      const tree: TreeNode = {
        label: 'Root',
        children: [
          { label: 'Child 1' },
          { label: 'Child 2' },
        ],
      };
      const output = formatter.tree(tree);
      expect(output).toBe('Root\nChild 1\nChild 2');
    });
  });
});

describe('getStatusIcon', () => {
  it('should return icon for open status', () => {
    expect(getStatusIcon('open')).toBe('○');
  });

  it('should return icon for in_progress status', () => {
    expect(getStatusIcon('in_progress')).toBe('◐');
  });

  it('should return icon for blocked status', () => {
    expect(getStatusIcon('blocked')).toBe('●');
  });

  it('should return icon for deferred status', () => {
    expect(getStatusIcon('deferred')).toBe('◌');
  });

  it('should return icon for closed status', () => {
    expect(getStatusIcon('closed')).toBe('✓');
  });

  it('should return icon for tombstone status', () => {
    expect(getStatusIcon('tombstone')).toBe('×');
  });

  it('should return ? for unknown status', () => {
    expect(getStatusIcon('unknown')).toBe('?');
  });
});

describe('STATUS_ICONS', () => {
  it('should have all common statuses', () => {
    expect(STATUS_ICONS.open).toBeDefined();
    expect(STATUS_ICONS.in_progress).toBeDefined();
    expect(STATUS_ICONS.blocked).toBeDefined();
    expect(STATUS_ICONS.deferred).toBeDefined();
    expect(STATUS_ICONS.closed).toBeDefined();
    expect(STATUS_ICONS.tombstone).toBeDefined();
    expect(STATUS_ICONS.draft).toBeDefined();
    expect(STATUS_ICONS.active).toBeDefined();
    expect(STATUS_ICONS.completed).toBeDefined();
    expect(STATUS_ICONS.abandoned).toBeDefined();
    expect(STATUS_ICONS.pending).toBeDefined();
    expect(STATUS_ICONS.running).toBeDefined();
    expect(STATUS_ICONS.paused).toBeDefined();
    expect(STATUS_ICONS.failed).toBeDefined();
  });
});

describe('getOutputMode with verbose', () => {
  it('should return verbose mode when verbose flag is true', () => {
    expect(getOutputMode({ verbose: true })).toBe('verbose');
  });

  it('should prefer json over verbose', () => {
    expect(getOutputMode({ json: true, verbose: true })).toBe('json');
  });

  it('should prefer quiet over verbose', () => {
    expect(getOutputMode({ quiet: true, verbose: true })).toBe('quiet');
  });
});

describe('Verbose Formatter', () => {
  const formatter = getFormatter('verbose');

  describe('success', () => {
    it('should return message like human formatter', () => {
      const result = success(undefined, 'Operation completed');
      expect(formatter.success(result)).toContain('Operation completed');
    });

    it('should add details section for object data', () => {
      const result = success({ id: 'el-abc', title: 'Task' });
      const output = formatter.success(result);
      expect(output).toContain('Details:');
      expect(output).toContain('id');
      expect(output).toContain('el-abc');
    });
  });

  describe('error', () => {
    it('should include exit code', () => {
      const result = failure('Something went wrong', 1);
      const output = formatter.error(result);
      expect(output).toContain('Error: Something went wrong');
      expect(output).toContain('Code: 1');
    });
  });

  describe('table', () => {
    it('should format table like human formatter', () => {
      const output = formatter.table(
        ['ID', 'TITLE'],
        [['el-abc', 'First task']]
      );
      expect(output).toContain('ID');
      expect(output).toContain('TITLE');
      expect(output).toContain('el-abc');
    });
  });

  describe('element', () => {
    it('should format element like human formatter', () => {
      const output = formatter.element({ id: 'el-abc', title: 'Task' });
      expect(output).toContain('id');
      expect(output).toContain('el-abc');
    });
  });

  describe('tree', () => {
    it('should format tree like human formatter', () => {
      const tree: TreeNode = { label: 'Root', children: [{ label: 'Child' }] };
      const output = formatter.tree(tree);
      expect(output).toContain('Root');
      expect(output).toContain('Child');
    });
  });
});
