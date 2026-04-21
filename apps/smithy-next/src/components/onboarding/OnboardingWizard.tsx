import { useReducer, useCallback } from 'react'
import { Check } from 'lucide-react'
import { onboardingReducer, INITIAL_STATE, STEP_LABELS, type OnboardingState } from './onboarding-types'
import { WorkspaceSetupStep } from './WorkspaceSetupStep'
import { AgentConfigStep } from './AgentConfigStep'
import { IntegrationsStep } from './IntegrationsStep'
import { WorkerEnvironmentStep } from './WorkerEnvironmentStep'
import { SummaryStep } from './SummaryStep'

interface OnboardingWizardProps {
  onComplete: (config: OnboardingState) => void
}

const TOTAL_STEPS = 5

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [state, dispatch] = useReducer(onboardingReducer, INITIAL_STATE)

  const goNext = useCallback(() => {
    if (state.step < TOTAL_STEPS - 1) {
      dispatch({ type: 'SET_STEP', step: state.step + 1 })
    } else {
      onComplete(state)
    }
  }, [state, onComplete])

  const goPrev = useCallback(() => {
    if (state.step > 0) dispatch({ type: 'SET_STEP', step: state.step - 1 })
  }, [state.step])

  const handleSkip = useCallback(() => {
    onComplete(state)
  }, [state, onComplete])

  function renderStep() {
    switch (state.step) {
      case 0: return <WorkspaceSetupStep state={state} dispatch={dispatch} />
      case 1: return <WorkerEnvironmentStep state={state} dispatch={dispatch} />
      case 2: return <AgentConfigStep state={state} dispatch={dispatch} />
      case 3: return <IntegrationsStep state={state} dispatch={dispatch} />
      case 4: return <SummaryStep state={state} />
      default: return null
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1060,
      background: 'var(--color-bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      overflow: 'auto',
    }}>
      {/* Header */}
      <div style={{
        width: '100%', maxWidth: 760, padding: '40px 24px 0',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        {/* Logo + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 'var(--radius-md)',
            background: 'var(--color-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}><img src="/logo.svg" alt="Stoneforge" style={{ width: 24, height: 24, objectFit: 'contain' }} /></div>
          <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text)' }}>
            Stoneforge
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 32 }}>
          Set up your workspace
        </p>

        {/* Step indicator */}
        <div className="onboarding-steps" style={{
          display: 'flex', alignItems: 'center', gap: 0, marginBottom: 40, width: '100%', maxWidth: 520,
          justifyContent: 'center',
        }}>
          {STEP_LABELS.map((label, i) => {
            const isActive = i === state.step
            const isCompleted = i < state.step
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && (
                  <div style={{
                    width: 48, height: 1,
                    background: isCompleted ? 'var(--color-primary)' : 'var(--color-border)',
                  }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600,
                    transition: 'all var(--duration-normal) ease',
                    ...(isActive ? {
                      background: 'var(--color-primary)', color: '#fff',
                      boxShadow: '0 0 0 3px var(--color-primary-subtle)',
                    } : isCompleted ? {
                      background: 'var(--color-primary)', color: '#fff',
                    } : {
                      background: 'var(--color-surface)', color: 'var(--color-text-tertiary)',
                      border: '1px solid var(--color-border)',
                    }),
                  }}>
                    {isCompleted ? <Check size={14} /> : i + 1}
                  </div>
                  <span className="onboarding-step-label" style={{
                    fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                    color: isActive ? 'var(--color-text)' : isCompleted ? 'var(--color-text-secondary)' : 'var(--color-text-tertiary)',
                  }}>{label}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, width: '100%', maxWidth: 760, padding: '0 24px',
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }}>
        <div style={{ flex: 1, overflow: 'auto', paddingBottom: 16 }}>
          {renderStep()}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        width: '100%', maxWidth: 760, padding: '16px 24px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderTop: '1px solid var(--color-border-subtle)',
      }}>
        <div>
          {state.step > 0 && (
            <button
              onClick={goPrev}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-text-secondary)', fontSize: 13, fontWeight: 500,
                padding: '6px 12px', borderRadius: 'var(--radius-sm)',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            >
              Previous
            </button>
          )}
        </div>

        <button
          onClick={handleSkip}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-tertiary)', fontSize: 12,
            textDecoration: 'underline', textUnderlineOffset: 3,
            padding: '6px 8px',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-tertiary)')}
        >
          Skip onboarding
        </button>

        <button
          onClick={goNext}
          style={{
            background: 'var(--color-primary)', color: '#fff', border: 'none',
            borderRadius: 'var(--radius-sm)', padding: '7px 20px',
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
            transition: 'opacity var(--duration-fast) ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          {state.step === TOTAL_STEPS - 1 ? 'Launch Workspace' : 'Next'}
        </button>
      </div>
    </div>
  )
}
