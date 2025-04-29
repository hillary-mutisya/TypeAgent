// TypeScript interfaces for our data structures
// These are just for documentation, as we're using JavaScript

// Available actions schema based on the TypeScript schema provided
const availableActions = [
    {
      name: "enterText",
      description: "Enters text in an input field",
      parameters: [
        {
          name: "textParameter",
          type: "string",
          description: "The shortName of the UserIntentParameter to use for this value",
          required: true
        }
      ]
    },
    {
      name: "enterTextAtPageScope",
      description: "Used on pages where the user can type anywhere in the document body and the page captures input",
      parameters: [
        {
          name: "textParameter",
          type: "string",
          description: "The shortName of the UserIntentParameter to use for this value",
          required: true
        }
      ]
    },
    {
      name: "selectValueFromDropdown",
      description: "Selects a value from a dropdown menu",
      parameters: [
        {
          name: "valueTextParameter",
          type: "string",
          description: "The shortName of the UserIntentParameter to use for this value",
          required: true
        }
      ]
    },
    {
      name: "clickOnButton",
      description: "Clicks on a button with specific text",
      parameters: [
        {
          name: "buttonText",
          type: "string",
          description: "The displayed text of the button to click on",
          required: true
        }
      ]
    },
    {
      name: "clickOnElement",
      description: "Clicks on an element in the page with specific text",
      parameters: [
        {
          name: "elementText",
          type: "string",
          description: "The displayed text of the element to click on",
          required: true
        }
      ]
    },
    {
      name: "ClickOnLink",
      description: "Clicks on a link with specific text",
      parameters: [
        {
          name: "linkTextParameter",
          type: "string",
          description: "The shortName of the UserIntentParameter to use for this value",
          required: true
        }
      ]
    }
  ];
  
  // Sample initial data
  const initialActionDefinition = {
    "actionName": "submitWord",
    "parameters": [
      {
        "description": "The word that the user wants to submit in the spelling bee game.",
        "name": "Word to submit",
        "required": true,
        "shortName": "word",
        "type": "string"
      }
    ]
  };
  
  const initialPlanDefinition = {
    "description": "This plan allows the user to submit a word in the spelling bee game.",
    "intentSchemaName": "submitWord",
    "planName": "SubmitWordPlan",
    "steps": [
      {
        "actionName": "clickOnElement",
        "parameters": {
          "elementText": "|"
        }
      },
      {
        "actionName": "enterTextAtPageScope",
        "parameters": {
          "textParameter": "word"
        }
      },
      {
        "actionName": "clickOnButton",
        "parameters": {
          "buttonText": "Enter"
        }
      }
    ]
  };
  
  class PlanVisualizer {
    constructor() {
      this.actionDefinition = JSON.parse(JSON.stringify(initialActionDefinition));
      this.planDefinition = JSON.parse(JSON.stringify(initialPlanDefinition));
      this.llmPrompt = "";
      this.llmResponse = "";
      this.currentUrl = "";
      this.currentPageTitle = "";
      this.savedPlans = {};
  
      // Initialize DOM elements
      this.actionNameInput = document.getElementById('action-name');
      this.actionParametersContainer = document.getElementById('action-parameters');
      this.planNameInput = document.getElementById('plan-name');
      this.intentSchemaNameInput = document.getElementById('intent-schema-name');
      this.planDescriptionInput = document.getElementById('plan-description');
      this.planStepsContainer = document.getElementById('plan-steps');
      this.planFlowContainer = document.getElementById('plan-flow');
      this.llmPromptInput = document.getElementById('llm-prompt');
      this.llmResponseDiv = document.getElementById('llm-response');
      this.pageInfoDiv = document.getElementById('page-info');
      this.savedPlansSelect = document.getElementById('saved-plans');
  
      // Get page info from the active tab
      this.getPageInfo();
  
      // Load saved plans from storage
      this.loadSavedPlansList();
  
      // Set up event listeners
      this.setupEventListeners();
  
      // Render initial data
      this.renderAll();
    }
  
    getPageInfo() {
      chrome.runtime.sendMessage({ action: 'getPageInfo' }, (response) => {
        if (response) {
          this.currentUrl = response.url;
          this.currentPageTitle = response.title;
          this.pageInfoDiv.textContent = `Page: ${this.currentPageTitle}`;
          
          // Try to load a plan for this URL
          this.loadPlanForCurrentUrl();
        }
      });
    }
  
    loadSavedPlansList() {
      chrome.storage.local.get('savedPlans', (result) => {
        if (result.savedPlans) {
          this.savedPlans = result.savedPlans;
          this.updateSavedPlansDropdown();
        }
      });
    }
  
    updateSavedPlansDropdown() {
      this.savedPlansSelect.innerHTML = '<option value="">Select a saved plan...</option>';
      
      const planKeys = Object.keys(this.savedPlans);
      if (planKeys.length > 0) {
        this.savedPlansSelect.classList.remove('hidden');
        
        for (const key of planKeys) {
          const option = document.createElement('option');
          option.value = key;
          option.textContent = this.savedPlans[key].planName || key;
          this.savedPlansSelect.appendChild(option);
        }
      } else {
        this.savedPlansSelect.classList.add('hidden');
      }
    }
  
    loadPlanForCurrentUrl() {
      if (!this.currentUrl) return;
      
      const urlKey = this.normalizeUrl(this.currentUrl);
      chrome.storage.local.get('plansByUrl', (result) => {
        if (result.plansByUrl && result.plansByUrl[urlKey]) {
          const planData = result.plansByUrl[urlKey];
          this.actionDefinition = planData.actionDefinition;
          this.planDefinition = planData.planDefinition;
          this.renderAll();
        }
      });
    }
  
    normalizeUrl(url) {
      // Remove protocol, query params, and hash for better matching
      return url.replace(/^https?:\/\//, '')
               .replace(/\?.*$/, '')
               .replace(/#.*$/, '');
    }
  
    setupEventListeners() {
      // Action Definition event listeners
      this.actionNameInput.addEventListener('input', (e) => {
        this.actionDefinition.actionName = e.target.value;
        this.renderPlanFlow();
      });
  
      document.getElementById('add-parameter-btn').addEventListener('click', () => {
        this.addParameter();
      });
  
      // Plan Definition event listeners
      this.planNameInput.addEventListener('input', (e) => {
        this.planDefinition.planName = e.target.value;
      });
  
      this.intentSchemaNameInput.addEventListener('input', (e) => {
        this.planDefinition.intentSchemaName = e.target.value;
      });
  
      this.planDescriptionInput.addEventListener('input', (e) => {
        this.planDefinition.description = e.target.value;
      });
  
      document.getElementById('add-step-btn').addEventListener('click', () => {
        this.addStep();
      });
  
      // LLM Integration event listeners
      this.llmPromptInput.addEventListener('input', (e) => {
        this.llmPrompt = e.target.value;
      });
  
      document.getElementById('send-to-llm-btn').addEventListener('click', () => {
        this.sendToLLM();
      });
  
      // Import/Export event listeners
      document.getElementById('export-plan').addEventListener('click', () => {
        this.exportPlan();
      });
  
      document.getElementById('import-plan').addEventListener('click', () => {
        this.importPlan();
      });
  
      // Save/Load from storage event listeners
      document.getElementById('save-plan').addEventListener('click', () => {
        this.savePlan();
      });
  
      document.getElementById('load-plan').addEventListener('click', () => {
        this.savedPlansSelect.classList.toggle('hidden');
      });
  
      this.savedPlansSelect.addEventListener('change', (e) => {
        if (e.target.value) {
          this.loadSavedPlan(e.target.value);
          this.savedPlansSelect.classList.add('hidden');
        }
      });
    }
  
    renderAll() {
      this.renderActionDefinition();
      this.renderPlanDefinition();
      this.renderPlanFlow();
    }
  
    renderActionDefinition() {
      this.actionNameInput.value = this.actionDefinition.actionName;
      this.renderParameters();
    }
  
    renderParameters() {
      this.actionParametersContainer.innerHTML = '';
  
      this.actionDefinition.parameters.forEach((param, index) => {
        const paramDiv = document.createElement('div');
        paramDiv.className = 'bg-gray-50 p-2 rounded-md mb-2 text-sm';
        paramDiv.innerHTML = `
          <div class="flex justify-between items-center mb-1">
            <span class="font-medium">${param.name}</span>
            <button class="text-red-500 hover:text-red-700 remove-param-btn" data-index="${index}">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            </button>
          </div>
          
          <div class="grid grid-cols-2 gap-1 mb-1">
            <div>
              <label class="block text-xs text-gray-500">Name</label>
              <input
                type="text"
                value="${param.name}"
                class="w-full p-1 text-xs border rounded param-name"
                data-index="${index}"
              />
            </div>
            <div>
              <label class="block text-xs text-gray-500">Short Name</label>
              <input
                type="text"
                value="${param.shortName}"
                class="w-full p-1 text-xs border rounded param-shortname"
                data-index="${index}"
              />
            </div>
          </div>
          
          <div class="mb-1">
            <label class="block text-xs text-gray-500">Description</label>
            <input
              type="text"
              value="${param.description}"
              class="w-full p-1 text-xs border rounded param-description"
              data-index="${index}"
            />
          </div>
          
          <div class="grid grid-cols-2 gap-1">
            <div>
              <label class="block text-xs text-gray-500">Type</label>
              <select
                class="w-full p-1 text-xs border rounded param-type"
                data-index="${index}"
              >
                <option value="string" ${param.type === 'string' ? 'selected' : ''}>string</option>
                <option value="number" ${param.type === 'number' ? 'selected' : ''}>number</option>
                <option value="boolean" ${param.type === 'boolean' ? 'selected' : ''}>boolean</option>
                <option value="object" ${param.type === 'object' ? 'selected' : ''}>object</option>
              </select>
            </div>
            <div class="flex items-center mt-2">
              <input
                type="checkbox"
                ${param.required ? 'checked' : ''}
                class="mr-1 param-required"
                data-index="${index}"
              />
              <label class="text-xs text-gray-500">Required</label>
            </div>
          </div>
        `;
  
        this.actionParametersContainer.appendChild(paramDiv);
  
        // Add event listeners for this parameter
        const removeBtn = paramDiv.querySelector('.remove-param-btn');
        removeBtn?.addEventListener('click', () => {
          this.removeParameter(index);
        });
  
        const nameInput = paramDiv.querySelector('.param-name');
        nameInput?.addEventListener('input', (e) => {
          this.updateParameter(index, 'name', e.target.value);
        });
  
        const shortnameInput = paramDiv.querySelector('.param-shortname');
        shortnameInput?.addEventListener('input', (e) => {
          this.updateParameter(index, 'shortName', e.target.value);
        });
  
        const descInput = paramDiv.querySelector('.param-description');
        descInput?.addEventListener('input', (e) => {
          this.updateParameter(index, 'description', e.target.value);
        });
  
        const typeSelect = paramDiv.querySelector('.param-type');
        typeSelect?.addEventListener('change', (e) => {
          this.updateParameter(index, 'type', e.target.value);
        });
  
        const requiredCheck = paramDiv.querySelector('.param-required');
        requiredCheck?.addEventListener('change', (e) => {
          this.updateParameter(index, 'required', e.target.checked);
        });
      });
    }
  
    renderPlanDefinition() {
      this.planNameInput.value = this.planDefinition.planName;
      this.intentSchemaNameInput.value = this.planDefinition.intentSchemaName;
      this.planDescriptionInput.value = this.planDefinition.description;
    this.renderSteps();
  }

  renderSteps() {
    this.planStepsContainer.innerHTML = '';

    this.planDefinition.steps.forEach((step, index) => {
      const stepDiv = document.createElement('div');
      stepDiv.className = 'bg-gray-50 p-3 rounded-md mb-2 relative';
      
      let arrowHtml = '';
      if (index > 0) {
        arrowHtml = `
          <div class="absolute -left-4 top-1/2 transform -translate-y-1/2 text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </div>
        `;
      }
      
      stepDiv.innerHTML = `
        ${arrowHtml}
        <div class="flex justify-between items-center mb-2">
          <span class="font-medium text-sm">Step ${index + 1}</span>
          <button class="text-red-500 hover:text-red-700 remove-step-btn" data-index="${index}">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
          </button>
        </div>
        
        <div class="mb-2">
          <label class="block text-xs text-gray-500">Action Name</label>
          <div class="flex items-center gap-1">
            <select
              class="w-full p-1 text-xs border rounded step-action"
              data-index="${index}"
            >
              ${availableActions.map(action => `
                <option value="${action.name}" ${step.actionName === action.name ? 'selected' : ''}>
                  ${action.name}
                </option>
              `).join('')}
            </select>
            
            <div class="relative">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info text-blue-500 cursor-help"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              <div class="tooltip">
                ${availableActions.find(action => action.name === step.actionName)?.description || "Action description"}
              </div>
            </div>
          </div>
        </div>
        
        <div>
          <div class="flex justify-between items-center mb-1">
            <label class="block text-xs text-gray-500">Parameters</label>
            
            <div class="add-param-container" data-index="${index}">
              <!-- Will be filled dynamically based on available parameters -->
            </div>
          </div>
          
          <div class="step-parameters" data-index="${index}">
            <!-- Will be filled dynamically based on step parameters -->
          </div>
          
          <div class="step-missing-params" data-index="${index}">
            <!-- Will be filled dynamically if there are missing parameters -->
          </div>
        </div>
      `;
      
      this.planStepsContainer.appendChild(stepDiv);
      
      // Add event listeners for this step
      const removeBtn = stepDiv.querySelector('.remove-step-btn');
      removeBtn?.addEventListener('click', () => {
        this.removeStep(index);
      });
      
      const actionSelect = stepDiv.querySelector('.step-action');
      actionSelect?.addEventListener('change', (e) => {
        this.updateStep(index, 'actionName', e.target.value);
      });
      
      // Render step parameters and available parameters to add
      this.renderStepParameters(index);
      this.renderAvailableStepParameters(index);
    });
  }

  renderStepParameters(stepIndex) {
    const step = this.planDefinition.steps[stepIndex];
    const parametersContainer = document.querySelector(`.step-parameters[data-index="${stepIndex}"]`);
    const missingParamsContainer = document.querySelector(`.step-missing-params[data-index="${stepIndex}"]`);
    
    if (!parametersContainer || !missingParamsContainer) return;
    
    parametersContainer.innerHTML = '';
    missingParamsContainer.innerHTML = '';
    
    // Get action schema for this step
    const actionSchema = availableActions.find(action => action.name === step.actionName);
    if (!actionSchema) return;
    
    // Check for missing required parameters
    const missingRequired = actionSchema.parameters
      .filter(param => param.required)
      .filter(param => !Object.keys(step.parameters).includes(param.name));
    
    // Render existing parameters
    Object.entries(step.parameters).forEach(([key, value]) => {
      const paramSchema = actionSchema.parameters.find(param => param.name === key);
      
      const paramRow = document.createElement('div');
      paramRow.className = 'grid grid-cols-6 gap-1 mb-1';
      paramRow.innerHTML = `
        <div class="col-span-2 flex items-center gap-1">
          <input
            type="text"
            value="${key}"
            disabled
            class="w-full p-1 text-xs bg-gray-100 border rounded"
          />
          ${paramSchema?.required ? '<span class="text-red-500 text-xs">*</span>' : ''}
          ${paramSchema ? `
            <div class="relative">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-info text-blue-500 cursor-help"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
              <div class="tooltip">
                ${paramSchema.description}
              </div>
            </div>
          ` : ''}
        </div>
        <div class="col-span-3">
          <input
            type="text"
            value="${value}"
            class="w-full p-1 text-xs border rounded step-param-value"
            data-step="${stepIndex}"
            data-param="${key}"
          />
        </div>
        <div class="col-span-1 flex justify-end">
          ${!(paramSchema?.required) ? `
            <button
              class="text-red-500 hover:text-red-700 remove-step-param-btn"
              data-step="${stepIndex}"
              data-param="${key}"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            </button>
          ` : ''}
        </div>
      `;
      
      parametersContainer.appendChild(paramRow);
      
      // Add event listeners for parameter inputs and remove buttons
      const valueInput = paramRow.querySelector('.step-param-value');
      valueInput?.addEventListener('input', (e) => {
        this.updateStepParameter(stepIndex, key, e.target.value);
      });
      
      const removeBtn = paramRow.querySelector('.remove-step-param-btn');
      removeBtn?.addEventListener('click', () => {
        this.removeStepParameter(stepIndex, key);
      });
    });
    
    // Render warning for missing required parameters
    if (missingRequired.length > 0) {
      const warningDiv = document.createElement('div');
      warningDiv.className = 'mt-2 p-1 bg-yellow-50 border border-yellow-200 rounded-md text-xs text-yellow-800 flex items-start gap-1';
      warningDiv.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle text-yellow-500 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
        <div>
          <p>Missing required parameters:</p>
          <ul class="list-disc pl-4 mt-1">
            ${missingRequired.map(param => `
              <li>${param.name}</li>
            `).join('')}
          </ul>
        </div>
      `;
      
      missingParamsContainer.appendChild(warningDiv);
    }
  }
  
  renderAvailableStepParameters(stepIndex) {
    const step = this.planDefinition.steps[stepIndex];
    const container = document.querySelector(`.add-param-container[data-index="${stepIndex}"]`);
    
    if (!container) return;
    
    const availableParams = this.getAvailableParametersForStep(stepIndex);
    
    if (availableParams.length > 0) {
      container.innerHTML = `
        <div class="flex items-center gap-1">
          <select
            class="text-xs p-1 border rounded add-step-param-select"
            data-index="${stepIndex}"
          >
            <option value="" disabled selected>Add...</option>
            ${availableParams.map(param => `
              <option value="${param.name}">${param.name}${param.required ? '*' : ''}</option>
            `).join('')}
          </select>
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus text-blue-600"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
        </div>
      `;
      
      const selectEl = container.querySelector('.add-step-param-select');
      selectEl?.addEventListener('change', (e) => {
        const paramName = e.target.value;
        if (paramName) {
          this.addStepParameter(stepIndex, paramName);
          e.target.value = "";
        }
      });
    } else {
      container.innerHTML = '';
    }
  }
  
  renderPlanFlow() {
    this.planFlowContainer.innerHTML = '';
    
    // Add action definition box
    const actionBox = document.createElement('div');
    actionBox.className = 'min-w-max px-3 py-2 bg-blue-100 rounded-md border border-blue-200';
    actionBox.innerHTML = `
      <div class="font-medium text-blue-800 text-xs">${this.actionDefinition.actionName}</div>
      <div class="text-xs text-blue-600">
        ${this.actionDefinition.parameters.length} param${this.actionDefinition.parameters.length !== 1 ? 's' : ''}
      </div>
    `;
    
    this.planFlowContainer.appendChild(actionBox);
    
    // Add arrow
    if (this.planDefinition.steps.length > 0) {
      const arrow = document.createElement('div');
      arrow.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right text-gray-400"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      `;
      this.planFlowContainer.appendChild(arrow);
    }
    
    // Add step boxes
    this.planDefinition.steps.forEach((step, index) => {
      const stepBox = document.createElement('div');
      stepBox.className = 'min-w-max px-3 py-2 bg-green-100 rounded-md border border-green-200';
      stepBox.innerHTML = `
        <div class="font-medium text-green-800 text-xs">${step.actionName}</div>
        <div class="text-xs text-green-600">
          ${Object.entries(step.parameters).map(([key, value]) => `
            <span class="mr-2">${key}: ${value}</span>
          `).join('')}
        </div>
      `;
      
      this.planFlowContainer.appendChild(stepBox);
      
      // Add arrow if not the last step
      if (index < this.planDefinition.steps.length - 1) {
        const arrow = document.createElement('div');
        arrow.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right text-gray-400"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        `;
        this.planFlowContainer.appendChild(arrow);
      }
    });
  }
  
  // Operations on Action Definition
  addParameter(newParam) {
    const param = newParam || {
      description: "New parameter description",
      name: "New Parameter",
      required: false,
      shortName: "newParam",
      type: "string"
    };
    
    this.actionDefinition.parameters.push(param);
    this.renderParameters();
    this.renderPlanFlow();
  }
  
  removeParameter(index) {
    this.actionDefinition.parameters.splice(index, 1);
    this.renderParameters();
    this.renderPlanFlow();
  }
  
  updateParameter(index, field, value) {
    if (field === 'required') {
      this.actionDefinition.parameters[index].required = value;
    } else {
      this.actionDefinition.parameters[index][field] = value;
    }
    this.renderPlanFlow();
  }
  
  // Operations on Plan Definition
  addStep(newStep) {
    if (newStep) {
      this.planDefinition.steps.push(newStep);
      this.renderSteps();
      this.renderPlanFlow();
      return;
    }
    
    // Get the first action from available actions
    const firstAction = availableActions[0];
    const initialParameters = {};
    
    // Initialize with required parameters
    firstAction.parameters.forEach(param => {
      if (param.required) {
        initialParameters[param.name] = param.type === "number" ? "0" : "";
      }
    });
    
    const step = {
      actionName: firstAction.name,
      parameters: initialParameters
    };
    
    this.planDefinition.steps.push(step);
    this.renderSteps();
    this.renderPlanFlow();
  }
  
  removeStep(index) {
    this.planDefinition.steps.splice(index, 1);
    this.renderSteps();
    this.renderPlanFlow();
  }
  
  updateStep(index, field, value) {
    if (field === "actionName") {
      // When changing action type, update parameters based on the new action schema
      const newActionName = value;
      const newActionSchema = availableActions.find(action => action.name === newActionName);
      
      if (newActionSchema) {
        // Create new parameters object with required parameters initialized
        const newParameters = {};
        
        newActionSchema.parameters.forEach(param => {
          if (param.required) {
            // Try to preserve existing values if parameter names match
            if (this.planDefinition.steps[index].parameters[param.name]) {
              newParameters[param.name] = this.planDefinition.steps[index].parameters[param.name];
            } else {
              newParameters[param.name] = param.type === "number" ? "0" : "";
            }
          }
        });
        
        this.planDefinition.steps[index] = {
          actionName: newActionName,
          parameters: newParameters
        };
      } else {
        // Fallback if action not found in schema
        this.planDefinition.steps[index].actionName = value;
      }
    }
    
    this.renderSteps();
    this.renderPlanFlow();
  }
  
  addStepParameter(stepIndex, paramName, defaultValue = "") {
    this.planDefinition.steps[stepIndex].parameters[paramName] = defaultValue;
    this.renderStepParameters(stepIndex);
    this.renderAvailableStepParameters(stepIndex);
    this.renderPlanFlow();
  }
  
  removeStepParameter(stepIndex, paramName) {
    delete this.planDefinition.steps[stepIndex].parameters[paramName];
    this.renderStepParameters(stepIndex);
    this.renderAvailableStepParameters(stepIndex);
    this.renderPlanFlow();
  }
  
  updateStepParameter(stepIndex, paramName, value) {
    this.planDefinition.steps[stepIndex].parameters[paramName] = value;
    this.renderPlanFlow();
  }
  
  getAvailableParametersForStep(stepIndex) {
    const step = this.planDefinition.steps[stepIndex];
    const actionSchema = availableActions.find(action => action.name === step.actionName);
    
    if (!actionSchema) return [];
    
    return actionSchema.parameters.filter(
      param => !Object.keys(step.parameters).includes(param.name)
    );
  }
  
  // LLM Integration
  async sendToLLM() {
    if (!this.llmPrompt.trim()) {
      this.setLLMResponse("Please enter a prompt");
      return;
    }
    
    this.setLLMResponse("Processing...");
    
    try {
      const response = await this.mockLLMRequest(this.llmPrompt);
      
      if (response.type === "addStep") {
        this.addStep(response.data);
        this.setLLMResponse("Added new step: " + response.data.actionName);
      } else if (response.type === "addParameter") {
        this.addParameter(response.data);
        this.setLLMResponse("Added new parameter: " + response.data.name);
      } else if (response.type === "removeStep") {
        this.removeStep(response.data.index);
        this.setLLMResponse("Removed step at position " + (response.data.index + 1));
      } else {
        this.setLLMResponse(response.message);
      }
    } catch (error) {
      this.setLLMResponse("Error processing request");
      console.error(error);
    }
  }
  
  setLLMResponse(message) {
    this.llmResponse = message;
    this.llmResponseDiv.textContent = message;
    this.llmResponseDiv.classList.remove('hidden');
  }
  
  async mockLLMRequest(prompt) {
    console.log("Sending to LLM:", prompt);
    
    // Simple mock responses based on keywords in the prompt
    if (prompt.toLowerCase().includes("add step") || prompt.toLowerCase().includes("new step")) {
      // Determine which action to add based on prompt
      let actionToAdd = availableActions[0].name; // default
      
      if (prompt.toLowerCase().includes("click")) {
        if (prompt.toLowerCase().includes("button")) {
          actionToAdd = "clickOnButton";
        } else if (prompt.toLowerCase().includes("link")) {
          actionToAdd = "ClickOnLink";
        } else {
          actionToAdd = "clickOnElement";
        }
      } else if (prompt.toLowerCase().includes("text") || prompt.toLowerCase().includes("type")) {
        if (prompt.toLowerCase().includes("page") || prompt.toLowerCase().includes("document")) {
          actionToAdd = "enterTextAtPageScope";
        } else {
          actionToAdd = "enterText";
        }
      } else if (prompt.toLowerCase().includes("dropdown") || prompt.toLowerCase().includes("select")) {
        actionToAdd = "selectValueFromDropdown";
      }
      
      // Get the default parameters for this action
      const actionSchema = availableActions.find(a => a.name === actionToAdd);
      const parameters = {};
      
      if (actionSchema) {
        actionSchema.parameters.forEach(param => {
          if (param.required) {
            if (param.name === "buttonText") {
              parameters[param.name] = "Submit";
            } else if (param.name === "elementText") {
              parameters[param.name] = "Element";
            } else if (param.name.includes("Parameter")) {
              // For parameters that reference action definition parameters, use the first one available
              const firstParam = this.actionDefinition.parameters[0]?.shortName || "word";
              parameters[param.name] = firstParam;
            } else {
              parameters[param.name] = "";
            }
          }
        });
      }
      
      return {
        type: "addStep",
        data: {
          actionName: actionToAdd,
          parameters
        }
      };
    } else if (prompt.toLowerCase().includes("add parameter") || prompt.toLowerCase().includes("new parameter")) {
      return {
        type: "addParameter",
        data: {
          description: "The timeout in milliseconds to wait for a response",
          name: "Timeout",
          required: false,
          shortName: "timeout",
          type: "number"
        }
      };
    } else if (prompt.toLowerCase().includes("remove step") || prompt.toLowerCase().includes("delete step")) {
      // Extract step number if mentioned
      const stepNumberMatch = prompt.match(/step\s+(\d+)/i);
      let stepIndex = this.planDefinition.steps.length - 1; // Default to last step
      
      if (stepNumberMatch && stepNumberMatch[1]) {
        const requestedIndex = parseInt(stepNumberMatch[1]) - 1; // Convert from 1-based to 0-based
        if (requestedIndex >= 0 && requestedIndex < this.planDefinition.steps.length) {
          stepIndex = requestedIndex;
        }
      }
      
      return {
        type: "removeStep",
        data: {
          index: stepIndex
        }
      };
    }
    
    return {
      type: "error",
      message: "I couldn't understand how to modify the plan. Try asking to add or remove a step or parameter."
    };
  }
  
  // Storage operations
  savePlan() {
    if (!this.planDefinition.planName) {
      this.setLLMResponse("Please set a plan name before saving");
      return;
    }
    
    const planData = {
      actionDefinition: this.actionDefinition,
      planDefinition: this.planDefinition,
      savedAt: new Date().toISOString()
    };
    
    // Save to local storage by plan name
    chrome.storage.local.get('savedPlans', (result) => {
      const savedPlans = result.savedPlans || {};
      savedPlans[this.planDefinition.planName] = planData;
      
      chrome.storage.local.set({ savedPlans }, () => {
        this.savedPlans = savedPlans;
        this.updateSavedPlansDropdown();
        this.setLLMResponse(`Plan "${this.planDefinition.planName}" saved successfully`);
      });
    });
    
    // Also save association between URL and plan if on a specific page
    if (this.currentUrl) {
      const urlKey = this.normalizeUrl(this.currentUrl);
      
      chrome.storage.local.get('plansByUrl', (result) => {
        const plansByUrl = result.plansByUrl || {};
        plansByUrl[urlKey] = planData;
        
        chrome.storage.local.set({ plansByUrl }, () => {
          console.log(`Plan associated with URL: ${this.currentUrl}`);
        });
      });
    }
  }
  
  loadSavedPlan(planName) {
    if (this.savedPlans[planName]) {
      const planData = this.savedPlans[planName];
      
      this.actionDefinition = planData.actionDefinition;
      this.planDefinition = planData.planDefinition;
      
      this.renderAll();
      this.setLLMResponse(`Plan "${planName}" loaded successfully`);
    } else {
      this.setLLMResponse(`Plan "${planName}" not found`);
    }
  }
  
  // Import/Export functionality
  exportPlan() {
    const planData = {
      actionDefinition: this.actionDefinition,
      planDefinition: this.planDefinition
    };
    
    const jsonString = JSON.stringify(planData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.planDefinition.planName || 'web-agent-plan'}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }
  
  importPlan() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target.result);
          
          if (json.actionDefinition && json.planDefinition) {
            this.actionDefinition = json.actionDefinition;
            this.planDefinition = json.planDefinition;
            
            this.renderAll();
            this.setLLMResponse("Plan imported successfully");
          } else {
            this.setLLMResponse("Invalid plan format");
          }
        } catch (error) {
          console.error("Error parsing JSON file", error);
          this.setLLMResponse("Error importing file. Make sure it's valid JSON.");
        }
      };
      
      reader.readAsText(file);
    };
    
    fileInput.click();
  }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PlanVisualizer();
});