// server.js
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const Tesseract = require('tesseract.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Home route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Image processing endpoint
app.post('/api/process-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        console.log('Processing image:', req.file.originalname);

        // Apply 2D filters using Sharp
        const processedImageBuffer = await apply2DFilters(req.file.buffer);

        // Save processed image temporarily
        const processedImagePath = path.join(uploadsDir, `processed_${Date.now()}.png`);
        await sharp(processedImageBuffer).png().toFile(processedImagePath);

        // Extract text using Tesseract OCR
        const extractedText = await extractTextFromImage(processedImageBuffer);

        // Convert processed image to base64 for frontend
        const processedImageBase64 = `data:image/png;base64,${processedImageBuffer.toString('base64')}`;

        // Clean up temporary file
        fs.unlink(processedImagePath, (err) => {
            if (err) console.error('Error deleting temp file:', err);
        });

        res.json({
            success: true,
            processedImage: processedImageBase64,
            extractedText: extractedText,
            message: 'Image processed successfully'
        });

    } catch (error) {
        console.error('Error processing image:', error);
        res.status(500).json({ 
            error: 'Failed to process image',
            details: error.message 
        });
    }
});

// Function to apply 2D filters
async function apply2DFilters(imageBuffer) {
    try {
        // Convert to grayscale and apply filters
        const processedImage = await sharp(imageBuffer)
            .grayscale() // Convert to grayscale
            .normalise() // Normalize contrast
            .sharpen({
                sigma: 1.0,
                flat: 1.0,
                jagged: 2.0
            }) // Edge enhancement
            .gamma(1.2) // Gamma correction for better contrast
            .png()
            .toBuffer();

        return processedImage;
    } catch (error) {
        console.error('Error applying 2D filters:', error);
        throw error;
    }
}

// Function to extract text using Tesseract OCR
async function extractTextFromImage(imageBuffer) {
    try {
        const { data: { text } } = await Tesseract.recognize(
            imageBuffer,
            'eng+fas', // English and Persian (Farsi) languages
            {
                logger: m => console.log(m), // Optional: log progress
                tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz۰۱۲۳۴۵۶۷۸۹آابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیة ',
                preserve_interword_spaces: '1',
            }
        );

        // Clean up extracted text
        const cleanedText = text.trim().replace(/\n+/g, '\n').replace(/\s+/g, ' ');
        
        if (cleanedText.length === 0) {
            return 'No text could be extracted from the image. Please try with a clearer image or one with more visible text.';
        }

        return cleanedText;
    } catch (error) {
        console.error('Error extracting text:', error);
        return 'Error occurred during text extraction. Please try again with a different image.';
    }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: '2D Filter OCR Server is running' });
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size too large. Maximum size is 10MB.' });
        }
    }
    
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('2D Filter Text Extraction Server is ready!');
});

module.exports = app;