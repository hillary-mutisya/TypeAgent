// Emergency diagnostic test for LLM integration issues
// Run this to identify the root cause of the LLM failure

import { LLMIntegrationService, DEFAULT_LLM_CONFIG } from '../src/agent/LLMIntegrationService.js';

async function diagnoseLLMIssue() {
    console.log('🔍 Diagnosing LLM Integration Issue\n');

    try {
        // Step 1: Test basic service creation
        console.log('1️⃣ Testing LLM Service Creation...');
        const llmService = new LLMIntegrationService("GPT_4o", DEFAULT_LLM_CONFIG);
        console.log('✅ LLM Service created (but not yet initialized)\n');

        // Step 2: Test the individual components
        console.log('2️⃣ Testing MarkdownAgent creation directly...');
        try {
            const { createMarkdownAgent } = await import('../src/agent/translator.js');
            console.log('✅ Translator module imported successfully');
            
            const agent = await createMarkdownAgent("GPT_4o");
            console.log('✅ MarkdownAgent created successfully');
            console.log('Agent type:', typeof agent);
            console.log('Agent methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(agent)));
        } catch (agentError) {
            console.error('❌ MarkdownAgent creation failed:', agentError);
            
            // Check environment variables
            console.log('\n🔧 Checking Azure OpenAI Environment Variables:');
            const envVars = [
                'AZURE_OPENAI_API_KEY',
                'AZURE_OPENAI_API_INSTANCE_NAME', 
                'AZURE_OPENAI_API_DEPLOYMENT_NAME',
                'AZURE_OPENAI_API_VERSION'
            ];
            
            envVars.forEach(varName => {
                const value = process.env[varName];
                console.log(`${varName}: ${value ? '✅ Set' : '❌ Missing'}`);
            });
            
            return;
        }

        // Step 3: Test simple updateDocument call
        console.log('\n3️⃣ Testing simple updateDocument call...');
        try {
            const { createMarkdownAgent } = await import('../src/agent/translator.js');
            const agent = await createMarkdownAgent("GPT_4o");
            
            const testContent = "# Test Document\n\nThis is a test.";
            const testPrompt = "Continue writing this document with a simple paragraph.";
            
            console.log('📝 Calling updateDocument...');
            const response = await agent.updateDocument(testContent, testPrompt);
            
            console.log('✅ updateDocument completed');
            console.log('Response success:', response.success);
            console.log('Response has data:', !!response.data);
            
            if (response.success && response.data) {
                console.log('Operations count:', response.data.operations?.length || 0);
                console.log('Summary:', response.data.operationSummary);
            } else {
                console.log('❌ Response was not successful');
                console.log('Full response:', JSON.stringify(response, null, 2));
            }
            
        } catch (updateError) {
            console.error('❌ updateDocument failed:', updateError);
            console.error('Error type:', updateError.constructor.name);
            console.error('Error message:', updateError.message);
            
            if (updateError.message.includes('API')) {
                console.log('💡 This appears to be an API configuration issue');
            } else if (updateError.message.includes('schema')) {
                console.log('💡 This appears to be a schema/validation issue');
            } else if (updateError.message.includes('network') || updateError.message.includes('fetch')) {
                console.log('💡 This appears to be a network connectivity issue');
            }
        }

        // Step 4: Test LLM Service processAIRequest
        console.log('\n4️⃣ Testing LLM Service processAIRequest...');
        try {
            const mockContext = {
                currentContent: "# Test Document\n\nThis is a test.",
                cursorPosition: 30,
                surroundingText: "This is a test.",
            };

            const result = await llmService.processAIRequest(
                'continue',
                { hint: 'simple test' },
                mockContext
            );

            console.log('✅ processAIRequest completed');
            console.log('Result type:', result.type);
            console.log('Content length:', result.content.length);
            console.log('Confidence:', result.confidence);
            
        } catch (processError) {
            console.error('❌ processAIRequest failed:', processError);
            console.error('This is the error we need to fix!');
        }

    } catch (error) {
        console.error('❌ Overall diagnostic failed:', error);
    }
}

// Run the diagnostic
diagnoseLLMIssue().catch(console.error);
