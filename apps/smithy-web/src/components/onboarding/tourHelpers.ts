/**
 * Helper functions for the onboarding tour that programmatically
 * interact with UI elements to demonstrate features.
 */

/**
 * Sets a React-controlled input's value by using the native setter,
 * which properly triggers React's synthetic event system.
 */
function setReactInputValue(input: HTMLInputElement, value: string): void {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Programmatically populates the Workflow Editor with example steps
 * to demonstrate how workflow templates work during the onboarding tour.
 *
 * Sets a template name/title and adds one task step + one function step.
 */
export function addExampleWorkflowSteps(): void {
  // Set a template name
  const nameInput = document.querySelector(
    '[data-testid="playbook-name-input"]',
  ) as HTMLInputElement | null;
  if (nameInput) {
    setReactInputValue(nameInput, 'deploy-pipeline');
  }

  // Set a template title
  const titleInput = document.querySelector(
    '[data-testid="playbook-title-input"]',
  ) as HTMLInputElement | null;
  if (titleInput) {
    setReactInputValue(titleInput, 'Deploy Pipeline');
  }

  // Click "Add Step" to add a task step
  const addStepBtn = document.querySelector(
    '[data-testid="add-step-button"]',
  ) as HTMLButtonElement | null;
  if (!addStepBtn) return;

  addStepBtn.click();
  setTimeout(() => {
    const addTaskStep = document.querySelector(
      '[data-testid="add-task-step"]',
    ) as HTMLButtonElement | null;
    if (addTaskStep) addTaskStep.click();

    // Add a second step (function step) after a brief delay
    setTimeout(() => {
      addStepBtn.click();
      setTimeout(() => {
        const addFuncStep = document.querySelector(
          '[data-testid="add-function-step"]',
        ) as HTMLButtonElement | null;
        if (addFuncStep) addFuncStep.click();
      }, 200);
    }, 300);
  }, 200);
}
