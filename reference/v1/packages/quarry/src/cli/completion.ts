/**
 * CLI Shell Completion
 *
 * Generates shell completion scripts for bash, zsh, and fish.
 */

import type { Command, CommandOption } from './types.js';

// ============================================================================
// Types
// ============================================================================

export type ShellType = 'bash' | 'zsh' | 'fish';

// ============================================================================
// Global Options (for completion)
// ============================================================================

const GLOBAL_OPTIONS: CommandOption[] = [
  { name: 'db', description: 'Database file path', hasValue: true },
  { name: 'actor', description: 'Actor name for operations', hasValue: true },
  { name: 'json', description: 'Output in JSON format' },
  { name: 'quiet', short: 'q', description: 'Minimal output (IDs only)' },
  { name: 'verbose', short: 'v', description: 'Enable debug output' },
  { name: 'help', short: 'h', description: 'Show help' },
  { name: 'version', short: 'V', description: 'Show version' },
];

// ============================================================================
// Bash Completion
// ============================================================================

/**
 * Generates a bash completion script
 */
export function generateBashCompletion(commands: Command[]): string {
  const commandNames = commands.map(c => c.name);
  const globalOpts = GLOBAL_OPTIONS.map(o => `--${o.name}`).concat(
    GLOBAL_OPTIONS.filter(o => o.short).map(o => `-${o.short}`)
  );

  // Build subcommand completions
  const subcommandCases = commands
    .filter(c => c.subcommands)
    .map(c => {
      const subNames = Object.keys(c.subcommands!);
      return `        ${c.name})
            COMPREPLY=($(compgen -W "${subNames.join(' ')}" -- "\${cur}"))
            return
            ;;`;
    })
    .join('\n');

  // Build option completions for each command
  const optionCases = commands
    .map(c => {
      const opts = (c.options || [])
        .map(o => `--${o.name}`)
        .concat((c.options || []).filter(o => o.short).map(o => `-${o.short}`));
      if (opts.length === 0) return '';
      return `        ${c.name})
            local cmd_opts="${opts.join(' ')}"
            COMPREPLY=($(compgen -W "\${cmd_opts} \${global_opts}" -- "\${cur}"))
            return
            ;;`;
    })
    .filter(Boolean)
    .join('\n');

  return `# Bash completion for stoneforge (sf)
# Add to ~/.bashrc or ~/.bash_completion:
#   source <(sf completion bash)

_stoneforge_completion() {
    local cur prev words cword
    _init_completion || return

    local commands="${commandNames.join(' ')}"
    local global_opts="${globalOpts.join(' ')}"

    # Complete global options when starting with -
    if [[ "\${cur}" == -* ]]; then
        COMPREPLY=($(compgen -W "\${global_opts}" -- "\${cur}"))
        return
    fi

    # No command yet - complete commands
    if [[ \${cword} -eq 1 ]]; then
        COMPREPLY=($(compgen -W "\${commands}" -- "\${cur}"))
        return
    fi

    # Command-specific completions
    local cmd="\${words[1]}"

    # Handle subcommands
    if [[ \${cword} -eq 2 ]]; then
        case "\${cmd}" in
${subcommandCases}
        esac
    fi

    # Handle command options
    case "\${cmd}" in
${optionCases}
    esac

    # Default to global options
    COMPREPLY=($(compgen -W "\${global_opts}" -- "\${cur}"))
}

complete -F _stoneforge_completion sf
complete -F _stoneforge_completion stoneforge
`;
}

// ============================================================================
// Zsh Completion
// ============================================================================

/**
 * Generates a zsh completion script
 */
export function generateZshCompletion(commands: Command[]): string {
  const globalOpts = GLOBAL_OPTIONS.map(o => {
    const short = o.short ? `(-${o.short})` : '';
    const value = o.hasValue ? ':value:' : '';
    return `    ${short}'--${o.name}[${escapeZsh(o.description)}]${value}'`;
  }).join(' \\\n');

  // Build command descriptions
  const cmdDescs = commands
    .map(c => `        '${c.name}:${escapeZsh(c.description)}'`)
    .join(' \\\n');

  // Build subcommand functions
  const subcommandFns = commands
    .filter(c => c.subcommands)
    .map(c => {
      const subDescs = Object.entries(c.subcommands!)
        .map(([name, sub]) => `            '${name}:${escapeZsh(sub.description)}'`)
        .join(' \\\n');
      return `_sf_${c.name}() {
    local -a subcommands
    subcommands=(
${subDescs}
    )
    _describe -t subcommands '${c.name} subcommand' subcommands
}`;
    })
    .join('\n\n');

  // Build command option completions
  const cmdOptFns = commands
    .filter(c => c.options && c.options.length > 0)
    .map(c => {
      const opts = c.options!.map(o => {
        const short = o.short ? `(-${o.short})` : '';
        const value = o.hasValue ? ':value:' : '';
        return `        ${short}'--${o.name}[${escapeZsh(o.description)}]${value}'`;
      }).join(' \\\n');
      return `_sf_${c.name}_options() {
    _arguments -s \\
${opts}
}`;
    })
    .join('\n\n');

  return `#compdef sf stoneforge
# Zsh completion for stoneforge (sf)
# Add to ~/.zshrc or fpath:
#   source <(sf completion zsh)

_sf() {
    local context state state_descr line
    typeset -A opt_args

    _arguments -C \\
${globalOpts} \\
        '1: :_sf_commands' \\
        '*::arg:->args'

    case \$state in
        args)
            case \$line[1] in
${commands.filter(c => c.subcommands).map(c =>
`                ${c.name})
                    _sf_${c.name}
                    ;;`).join('\n')}
${commands.filter(c => c.options && c.options.length > 0 && !c.subcommands).map(c =>
`                ${c.name})
                    _sf_${c.name}_options
                    ;;`).join('\n')}
            esac
            ;;
    esac
}

_sf_commands() {
    local -a commands
    commands=(
${cmdDescs}
    )
    _describe -t commands 'sf command' commands
}

${subcommandFns}

${cmdOptFns}

_sf "$@"
`;
}

/**
 * Escape special characters for zsh completion descriptions
 */
function escapeZsh(str: string): string {
  return str.replace(/'/g, "\\'").replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

// ============================================================================
// Fish Completion
// ============================================================================

/**
 * Generates a fish completion script
 */
export function generateFishCompletion(commands: Command[]): string {
  const lines: string[] = [
    '# Fish completion for stoneforge (sf)',
    '# Add to ~/.config/fish/completions/sf.fish:',
    '#   sf completion fish > ~/.config/fish/completions/sf.fish',
    '',
    '# Disable file completion by default',
    'complete -c sf -f',
    'complete -c stoneforge -f',
    '',
    '# Global options',
  ];

  // Global options
  for (const opt of GLOBAL_OPTIONS) {
    const short = opt.short ? `-s ${opt.short} ` : '';
    const requiresArg = opt.hasValue ? '-r ' : '';
    lines.push(`complete -c sf ${short}-l ${opt.name} ${requiresArg}-d '${escapeFish(opt.description)}'`);
    lines.push(`complete -c stoneforge ${short}-l ${opt.name} ${requiresArg}-d '${escapeFish(opt.description)}'`);
  }

  lines.push('', '# Commands');

  // Commands
  for (const cmd of commands) {
    lines.push(`complete -c sf -n '__fish_use_subcommand' -a ${cmd.name} -d '${escapeFish(cmd.description)}'`);
    lines.push(`complete -c stoneforge -n '__fish_use_subcommand' -a ${cmd.name} -d '${escapeFish(cmd.description)}'`);

    // Subcommands
    if (cmd.subcommands) {
      lines.push('', `# ${cmd.name} subcommands`);
      for (const [subName, sub] of Object.entries(cmd.subcommands)) {
        lines.push(`complete -c sf -n '__fish_seen_subcommand_from ${cmd.name}' -a ${subName} -d '${escapeFish(sub.description)}'`);
        lines.push(`complete -c stoneforge -n '__fish_seen_subcommand_from ${cmd.name}' -a ${subName} -d '${escapeFish(sub.description)}'`);
      }
    }

    // Command options
    if (cmd.options && cmd.options.length > 0) {
      lines.push('', `# ${cmd.name} options`);
      for (const opt of cmd.options) {
        const short = opt.short ? `-s ${opt.short} ` : '';
        const requiresArg = opt.hasValue ? '-r ' : '';
        lines.push(`complete -c sf -n '__fish_seen_subcommand_from ${cmd.name}' ${short}-l ${opt.name} ${requiresArg}-d '${escapeFish(opt.description)}'`);
        lines.push(`complete -c stoneforge -n '__fish_seen_subcommand_from ${cmd.name}' ${short}-l ${opt.name} ${requiresArg}-d '${escapeFish(opt.description)}'`);
      }
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Escape special characters for fish completion descriptions
 */
function escapeFish(str: string): string {
  return str.replace(/'/g, "\\'");
}

// ============================================================================
// Main Generator
// ============================================================================

/**
 * Generates a shell completion script for the specified shell
 */
export function generateCompletion(shell: ShellType, commands: Command[]): string {
  switch (shell) {
    case 'bash':
      return generateBashCompletion(commands);
    case 'zsh':
      return generateZshCompletion(commands);
    case 'fish':
      return generateFishCompletion(commands);
    default:
      throw new Error(`Unsupported shell: ${shell}`);
  }
}

/**
 * Gets installation instructions for the specified shell
 */
export function getInstallInstructions(shell: ShellType): string {
  switch (shell) {
    case 'bash':
      return `# Add to ~/.bashrc or ~/.bash_profile:
source <(sf completion bash)

# Or save to a file:
sf completion bash > ~/.local/share/bash-completion/completions/sf`;

    case 'zsh':
      return `# Add to ~/.zshrc:
source <(sf completion zsh)

# Or save to a file in your fpath:
sf completion zsh > ~/.zsh/completions/_sf`;

    case 'fish':
      return `# Save to completions directory:
sf completion fish > ~/.config/fish/completions/sf.fish`;

    default:
      throw new Error(`Unsupported shell: ${shell}`);
  }
}
