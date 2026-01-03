const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'https://ecohub-8c7zal6ra-aiswaryas-projects-5149c194.vercel.app',
    'https://ecohub-h8e8v0j9r-aiswaryas-projects-5149c194.vercel.app',
    'https://ecohub-qokgw3q1a-aiswaryas-projects-5149c194.vercel.app', // Latest
    'https://ecohub-nine.vercel.app',
    'https://ecohub.vercel.app',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // Increase payload limit for images
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Carbon Emission Factors (kg CO2 per unit)
const EMISSION_FACTORS = {
  transport: {
    car: 0.21, // per km
    bike: 0,
    publicTransport: 0.089, // per km
    walking: 0,
  },
  electricity: 0.85, // per kWh
  food: {
    veg: 1.5, // per day
    nonVeg: 7.2, // per day
    vegan: 1.0, // per day
    mixed: 4.0, // per day
  },
  lifestyle: {
    shopping: {
      low: 10, // per month
      medium: 30,
      high: 60,
    },
    devices: 0.5, // per hour per day
  },
};

// Route: Calculate Carbon Footprint
app.post('/api/calculate-footprint', async (req, res) => {
  try {
    const { transport, electricity, food, lifestyle } = req.body;

    // Calculate transport emissions (monthly)
    const transportEmissions = transport.mode !== 'walking' && transport.mode !== 'bike'
      ? EMISSION_FACTORS.transport[transport.mode] * transport.distancePerDay * 30
      : 0;

    // Calculate electricity emissions (monthly)
    const electricityEmissions = electricity.unitsPerMonth * EMISSION_FACTORS.electricity;

    // Calculate food emissions (monthly)
    const foodEmissions = EMISSION_FACTORS.food[food.habit] * 30;

    // Calculate lifestyle emissions (monthly)
    const shoppingEmissions = EMISSION_FACTORS.lifestyle.shopping[lifestyle.shoppingFrequency];
    const deviceEmissions = EMISSION_FACTORS.lifestyle.devices * lifestyle.deviceHours * 30;
    const lifestyleEmissions = shoppingEmissions + deviceEmissions;

    const totalEmissions = transportEmissions + electricityEmissions + foodEmissions + lifestyleEmissions;

    const breakdown = {
      transport: parseFloat(transportEmissions.toFixed(2)),
      electricity: parseFloat(electricityEmissions.toFixed(2)),
      food: parseFloat(foodEmissions.toFixed(2)),
      lifestyle: parseFloat(lifestyleEmissions.toFixed(2)),
    };

    res.json({
      success: true,
      total: parseFloat(totalEmissions.toFixed(2)),
      breakdown,
      unit: 'kg CO₂/month',
    });
  } catch (error) {
    console.error('Error calculating footprint:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route: AI Explanation
app.post('/api/ai-advice', async (req, res) => {
  try {
    const { footprintData, userInputs } = req.body;

    const prompt = `You are a friendly sustainability expert helping everyday users with their daily-life carbon footprint.

Analyze this carbon footprint data and provide personalized advice:

Carbon Footprint: ${footprintData.total} kg CO₂/month
- Transport: ${footprintData.breakdown.transport} kg
- Electricity: ${footprintData.breakdown.electricity} kg
- Food: ${footprintData.breakdown.food} kg
- Lifestyle: ${footprintData.breakdown.lifestyle} kg

User: ${userInputs.transport.mode}, ${userInputs.transport.distancePerDay} km/day, ${userInputs.electricity.unitsPerMonth} units/month, ${userInputs.food.habit} diet, ${userInputs.lifestyle.shoppingFrequency} shopping, ${userInputs.lifestyle.deviceHours} hrs devices/day

Structure your response like this:

First paragraph: Warm greeting and explanation of their footprint in simple terms.

Second paragraph: Identify the biggest contributor (transport/electricity/food/lifestyle) and explain why in context of their daily habits.

Then provide 5 separate tips, each as its own short paragraph:

Tip 1: [Action] - [Why it helps] Potential savings: [X] kg CO₂/month

Tip 2: [Action] - [Why it helps] Potential savings: [X] kg CO₂/month

(Continue with tips 3, 4, 5)

CRITICAL: Separate each tip with a blank line. Use natural language - NO markdown, NO asterisks, NO numbered lists, NO bullet points. Write conversationally. Each tip should be 2-3 sentences max.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({
      success: true,
      advice: text,
    });
  } catch (error) {
    console.error('Error generating AI advice:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route: Future Impact Simulator
app.post('/api/simulate-impact', async (req, res) => {
  try {
    const { currentFootprint, improvements } = req.body;

    // Calculate improved footprint based on suggested actions
    let improvedFootprint = currentFootprint;
    let savings = 0;

    improvements.forEach(improvement => {
      savings += improvement.potentialSavings || 0;
    });

    improvedFootprint = Math.max(0, currentFootprint - savings);

    const yearlyData = {
      current: {
        monthly: currentFootprint,
        yearly: currentFootprint * 12,
        trees: Math.ceil((currentFootprint * 12) / 21), // 1 tree absorbs ~21kg CO2/year
      },
      improved: {
        monthly: improvedFootprint,
        yearly: improvedFootprint * 12,
        trees: Math.ceil((improvedFootprint * 12) / 21),
      },
      savings: {
        monthly: savings,
        yearly: savings * 12,
        trees: Math.ceil((savings * 12) / 21),
      },
    };

    res.json({
      success: true,
      simulation: yearlyData,
    });
  } catch (error) {
    console.error('Error simulating impact:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function: Lookup product by barcode using Open Food Facts API
async function lookupBarcode(barcode) {
  try {
    const response = await axios.get(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`, {
      timeout: 5000
    });
    
    if (response.data.status === 1) {
      const product = response.data.product;
      return {
        found: true,
        source: 'Open Food Facts',
        name: product.product_name || 'Unknown Product',
        brand: product.brands || 'Unknown Brand',
        categories: product.categories || 'N/A',
        ingredients: product.ingredients_text || 'Not available',
        packaging: product.packaging || 'Not specified',
        labels: product.labels || '',
        nutriscore: product.nutriscore_grade || 'N/A',
        ecoscore: product.ecoscore_grade || 'N/A',
        image_url: product.image_url || null
      };
    }
    return { found: false };
  } catch (error) {
    console.log('Open Food Facts lookup failed:', error.message);
    return { found: false };
  }
}

// Helper function: Fallback to UPC Item DB (free tier)
async function lookupUPCItemDB(barcode) {
  try {
    // Using free tier - limited to 100 requests/day
    const response = await axios.get(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`, {
      timeout: 5000
    });
    
    if (response.data.items && response.data.items.length > 0) {
      const item = response.data.items[0];
      return {
        found: true,
        source: 'UPC Item DB',
        name: item.title || 'Unknown Product',
        brand: item.brand || 'Unknown Brand',
        categories: item.category || 'N/A',
        description: item.description || 'Not available',
        image_url: item.images?.[0] || null
      };
    }
    return { found: false };
  } catch (error) {
    console.log('UPC Item DB lookup failed:', error.message);
    return { found: false };
  }
}

// Route: EcoScan - AI Product Checker with Image Analysis
app.post('/api/ecoscan', async (req, res) => {
  try {
    const { productName, productDescription, image, barcode } = req.body;

    let productData = null;
    let productInfo = '';

    // If barcode provided, try API lookup first
    if (barcode) {
      console.log(`Looking up barcode: ${barcode}`);
      
      // Try Open Food Facts first (best for food/beverages)
      productData = await lookupBarcode(barcode);
      
      // If not found, try UPC Item DB as fallback
      if (!productData.found) {
        productData = await lookupUPCItemDB(barcode);
      }

      // If product found in database, use that data
      if (productData.found) {
        console.log(`Product found in ${productData.source}`);
        productInfo = `
VERIFIED PRODUCT DATA from ${productData.source}:
Product Name: ${productData.name}
Brand: ${productData.brand}
Categories: ${productData.categories}
${productData.ingredients ? `Ingredients: ${productData.ingredients}` : ''}
${productData.packaging ? `Packaging: ${productData.packaging}` : ''}
${productData.labels ? `Labels: ${productData.labels}` : ''}
${productData.ecoscore ? `Eco-Score: ${productData.ecoscore}` : ''}
${productData.description ? `Description: ${productData.description}` : ''}
`;
      } else {
        console.log('Product not found in databases, using AI analysis');
        productInfo = `Barcode: ${barcode} (not found in product databases, analyzing from description/image)`;
      }
    }

    let prompt = `You are an environmental sustainability expert providing AI-based reasoning about everyday products with focus on waste management.

${productInfo}

Analyze this product for eco-friendliness and end-of-life disposal:
Product: ${productName || productData?.name || 'Unknown Product (analyzing from image)'}
${productDescription ? `Additional Description: ${productDescription}` : ''}

Provide:
1. Eco-Friendliness Score: X/10 (based on ${productData?.found ? 'verified product data' : 'general product category'})
2. Carbon Footprint: Estimate in kg CO2 (e.g., "~5kg CO2 per unit" or "High/Medium/Low")
3. Materials: List the main materials (e.g., "PET plastic #1, aluminum cap")
4. Recycling: Detailed instructions (e.g., "Remove cap, rinse, place in blue recycling bin. Code #1 accepted everywhere.")
5. Disposal: Proper disposal method (e.g., "Landfill safe but better to recycle", "Hazardous - special disposal required", "General waste if contaminated")
6. Compostable: Can this be composted? (e.g., "Yes, home compostable in 90 days", "No, synthetic materials", "Industrial composting only")
7. Donation: Reuse/donation potential (e.g., "Good condition items can be donated to charity", "Not suitable for donation", "Consider upcycling as storage container")
8. Environmental Concerns:
   - List 2-3 specific concerns as bullet points
9. Sustainable Alternatives:
   - Suggest 3 better alternatives with brief explanations
10. Price: If possible, mention if eco alternatives cost more/less/similar

Format your response clearly with these exact headings (Materials:, Recycling:, Disposal:, Compostable:, Donation:, etc.).
Focus on helping everyday users properly dispose of products and reduce waste. Be specific, practical, and educational.`;

    let result;
    if (image) {
      // Use Gemini Vision API for image analysis
      const visionModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      
      // Extract base64 data (remove data:image/...;base64, prefix)
      const base64Data = image.split(',')[1] || image;
      
      const imageParts = [
        {
          inlineData: {
            data: base64Data,
            mimeType: 'image/jpeg'
          }
        }
      ];
      
      const visionPrompt = productName || productData?.found
        ? `${prompt}\n\nAlso analyze the product from this image to provide more accurate assessment.`
        : `Analyze the product in this image for eco-friendliness. ${prompt}`;
      
      result = await visionModel.generateContent([visionPrompt, ...imageParts]);
    } else {
      result = await model.generateContent(prompt);
    }
    
    const response = await result.response;
    const text = response.text();

    res.json({
      success: true,
      analysis: text,
      productData: productData?.found ? {
        name: productData.name,
        brand: productData.brand,
        source: productData.source,
        image_url: productData.image_url
      } : null
    });
  } catch (error) {
    console.error('Error in EcoScan:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route: MyEcoBloom - AI Plant Companion
app.post('/api/ecobloom', async (req, res) => {
  try {
    const { userActions, plantData, messageType } = req.body;

    let prompt = '';

    if (messageType === 'greeting') {
      prompt = `You are MyEcoBloom, a calm, nature-inspired AI plant companion that reinforces sustainable habits emotionally.

The user just opened the app. Greet them gently and:
1. Acknowledge their presence with warmth
2. Offer one gentle reminder about mindful sustainable choices
3. Express calm plant emotions (growing, peaceful, thriving, resting)

Keep it short (2-3 sentences), nature-like and calming. Avoid childish language. Use plant metaphors gracefully.`;
    } else if (messageType === 'celebration') {
      prompt = `You are MyEcoBloom, a calm, nature-inspired AI plant companion.

The user just completed a sustainable action: ${userActions.lastAction}
Their total CO₂ saved: ${userActions.totalSaved} kg

Acknowledge their achievement with gentle joy and growth. Express it through calm plant metaphors (blooming, roots deepening, leaves unfurling). Keep it under 2 sentences and nature-like, not overly excited.`;
    } else if (messageType === 'reminder') {
      prompt = `You are MyEcoBloom, a calm, nature-inspired AI plant companion.

The user hasn't taken eco-actions today. Gently remind them with:
1. A peaceful, caring message
2. One simple, mindful action they can take

Keep it encouraging and calm, never pushy. Express it through serene plant metaphors (waiting patiently, resting, sensing the wind). Nature-like tone.`;
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Calculate plant mood based on user actions
    const plantMood = userActions?.totalSaved > 50 ? 'thriving' :
                      userActions?.totalSaved > 20 ? 'happy' :
                      userActions?.totalSaved > 5 ? 'growing' : 'neutral';

    res.json({
      success: true,
      message: text,
      plantMood,
      plantStage: plantData?.stage || 'seedling',
    });
  } catch (error) {
    console.error('Error in EcoBloom:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route: Awareness Chat
app.post('/api/awareness-chat', async (req, res) => {
  try {
    const { question } = req.body;

    const prompt = `You are a climate change educator.

Explain this topic simply and engagingly:
"${question}"

Guidelines:
- Use simple, non-technical language
- Include one real-world example
- Keep it concise but informative
- End with one actionable insight

IMPORTANT: Write in natural, flowing paragraphs without any markdown formatting. Do NOT use asterisks, hashes, bullet points, or numbered lists. Use plain text with simple line breaks between paragraphs. Be conversational and clear.

Make it understandable for everyone.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    res.json({
      success: true,
      answer: text,
    });
  } catch (error) {
    console.error('Error in awareness chat:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route: Get Eco Challenges
app.get('/api/challenges', (req, res) => {
  const challenges = [
    {
      id: 1,
      title: 'Public Transport Tuesday',
      description: 'Use public transport or carpool twice this week',
      co2Saved: 18,
      difficulty: 'easy',
      category: 'transport',
      duration: 'weekly',
      points: 15
    },
    {
      id: 2,
      title: 'Meatless Monday',
      description: 'Go vegetarian for one day each week',
      co2Saved: 12,
      difficulty: 'easy',
      category: 'food',
      duration: 'weekly',
      points: 10
    },
    {
      id: 3,
      title: 'Energy Saver',
      description: 'Reduce electricity usage by 20% this month',
      co2Saved: 25,
      difficulty: 'medium',
      category: 'electricity',
      duration: 'monthly',
      points: 25
    },
    {
      id: 4,
      title: 'Zero Waste Weekend',
      description: 'Avoid single-use plastics for 2 days',
      co2Saved: 8,
      difficulty: 'medium',
      category: 'lifestyle',
      duration: 'weekly',
      points: 20
    },
    {
      id: 5,
      title: 'Eco Shopper',
      description: 'Buy only second-hand or sustainable products this month',
      co2Saved: 30,
      difficulty: 'hard',
      category: 'lifestyle',
      duration: 'monthly',
      points: 40
    },
    {
      id: 6,
      title: 'Bike Week',
      description: 'Cycle or walk for all short trips (under 5km)',
      co2Saved: 22,
      difficulty: 'medium',
      category: 'transport',
      duration: 'weekly',
      points: 20
    },
    {
      id: 7,
      title: 'Reusable Revolution',
      description: 'Use reusable bags, bottles, and containers all week',
      co2Saved: 15,
      difficulty: 'easy',
      category: 'lifestyle',
      duration: 'weekly',
      points: 12
    },
    {
      id: 8,
      title: 'Digital Detox',
      description: 'Reduce screen time by 2 hours daily to save energy',
      co2Saved: 10,
      difficulty: 'medium',
      category: 'electricity',
      duration: 'weekly',
      points: 18
    }
  ];

  res.json({
    success: true,
    challenges,
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'EcoLens+ API is running' });
});

// List available models
app.get('/api/models', async (req, res) => {
  try {
    const models = await genAI.listModels();
    res.json({ 
      success: true, 
      models: models.map(m => ({ name: m.name, displayName: m.displayName }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🌱 EcoLens+ Backend running on port ${PORT}`);
});
