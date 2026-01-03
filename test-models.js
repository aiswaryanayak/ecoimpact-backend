const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI('AIzaSyBHYYa-rv4cgnx35qQHbVH8Jx9BxEms71M');

// Test available models
async function testModels() {
  const models = [
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-1.5-flash-8b',
    'gemini-1.5-flash'
  ];

  console.log('Testing available models...\n');

  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Test');
      console.log(`✅ ${modelName} - WORKS`);
    } catch (error) {
      console.log(`❌ ${modelName} - ${error.message}`);
    }
  }
}

testModels();
