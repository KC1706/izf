const puppeteer = require('puppeteer');
const fs = require('fs');

// IZF vendor ID - Replace this with the actual UUID from your database
const IZF_VENDOR_ID = '00000000-0000-0000-0000-000000000000';  // placeholder UUID

// Collection URLs with their category tags
const COLLECTIONS = [
    {
        url: 'https://izfworld.com/collections/top',
        categoryTags: ['women', 'topwear', 'tops', 'tank tops', 'sleeveless']
    },
    {
        url: 'https://izfworld.com/collections/tees',
        categoryTags: ['women', 'topwear', 'tops', 't-shirts', 'tees']
    },
    {
        url: 'https://izfworld.com/collections/women-shirts',
        categoryTags: ['women', 'topwear', 'tops', 'shirts']
    },
    {
        url: 'https://izfworld.com/collections/shrugs',
        categoryTags: ['women', 'topwear', 'shrugs', 'layering']
    },
    {
        url: 'https://izfworld.com/collections/skirts',
        categoryTags: ['women', 'bottomwear', 'skirts']
    },
    {
        url: 'https://izfworld.com/collections/skirts-1',
        categoryTags: ['women', 'bottomwear', 'skirts']
    },
    {
        url: 'https://izfworld.com/collections/jeans-pants-more',
        categoryTags: ['women', 'bottomwear', 'pants', 'jeans', 'trousers']
    }
];

// Function to extract additional tags from product description
function extractTagsFromText(text) {
    const tags = new Set();
    
    // Extract hashtags
    const hashtags = text.match(/#\w+/g) || [];
    hashtags.forEach(tag => tags.add(tag.slice(1).toLowerCase()));
    
    // Extract keywords from styling tips
    if (text.toLowerCase().includes('styling tip')) {
        const keywords = text.toLowerCase()
            .match(/(?:pair|wear|style)\s+(?:with|it)\s+([^.]+)/g) || [];
        keywords.forEach(match => {
            const words = match.split(/\s+/);
            words.forEach(word => {
                if (word.length > 3 && !['with', 'and', 'the', 'for'].includes(word)) {
                    tags.add(word);
                }
            });
        });
    }
    
    return Array.from(tags);
}

async function getProductDetails(page, url, categoryTags) {
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    const details = await page.evaluate(() => {
        const descriptionElement = document.querySelector('.cc-accordion-item__content.rte');
        if (!descriptionElement) return null;

        // Extract main description (first paragraph)
        const mainDescription = descriptionElement.querySelector('p:first-child')?.textContent.trim() || '';
        
        // Extract additional details
        const additionalDetails = {};
        const paragraphs = descriptionElement.querySelectorAll('p');
        paragraphs.forEach(p => {
            const text = p.textContent.trim();
            if (text.includes('Fit:')) additionalDetails.fit = text.split('Fit:')[1].trim();
            if (text.includes('Neck :')) additionalDetails.neck = text.split('Neck :')[1].trim();
            if (text.includes('Sleeve :')) additionalDetails.sleeve = text.split('Sleeve :')[1].trim();
            if (text.includes('Length :')) additionalDetails.length = text.split('Length :')[1].trim();
            if (text.includes('Print Type:')) additionalDetails.printType = text.split('Print Type:')[1].trim();
            if (text.includes('Occasion:')) additionalDetails.occasion = text.split('Occasion:')[1].trim();
            if (text.includes('Shipping Time:')) additionalDetails.shippingTime = text.split('Shipping Time:')[1].trim();
            if (text.includes('Delivery Time:')) additionalDetails.deliveryTime = text.split('Delivery Time:')[1].trim();
        });

        // Extract any hashtags or styling keywords from description
        const extractedTags = new Set();
        document.querySelectorAll('.cc-accordion-item__content.rte p').forEach(p => {
            const text = p.textContent.trim();
            // Extract hashtags
            const hashtags = text.match(/#\w+/g) || [];
            hashtags.forEach(tag => extractedTags.add(tag.slice(1).toLowerCase()));
            
            // Extract keywords from styling tips
            if (text.toLowerCase().includes('styling tip')) {
                text.toLowerCase().split(/[.,!?]/).forEach(sentence => {
                    if (sentence.includes('pair with') || sentence.includes('wear with')) {
                        sentence.split(/\s+/).forEach(word => {
                            if (word.length > 3 && !['with', 'and', 'the', 'for'].includes(word)) {
                                extractedTags.add(word);
                            }
                        });
                    }
                });
            }
        });

        return {
            description: mainDescription,
            additionalDetails,
            extractedTags: Array.from(extractedTags)
        };
    });

    return details;
}

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    let products = [];

    // Iterate through each collection
    for (const collection of COLLECTIONS) {
        console.log(`Starting collection: ${collection.url}`);
        let pageNumber = 1;
        let hasNextPage = true;

        while (hasNextPage) {
            const url = `${collection.url}?page=${pageNumber}`;
        console.log(`Scraping: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2' });

        let pageProducts = await page.evaluate((vendorId) => {
            const productElements = document.querySelectorAll('.product-block');
            let extractedProducts = [];
            
            productElements.forEach(product => {
                let title = product.querySelector('.title')?.innerText.trim() || '';
                let productUrl = product.querySelector('a.caption')?.href || '';
                let price = product.querySelector('.price .theme-money')?.innerText.trim() || '';
                let discountPrice = product.querySelector('.was-price')?.innerText.trim() || '';
                let rating = product.querySelector('.jdgm-prev-badge')?.getAttribute('data-average-rating') || '';
                let reviewCount = product.querySelector('.jdgm-prev-badge')?.getAttribute('data-number-of-reviews') || '';
                
                let sizes = Array.from(product.querySelectorAll('.prd_name ul li a')).map(size => size.innerText.trim());
                let colors = Array.from(product.querySelectorAll('.cc-swatches li a')).map(color => color.title.trim());
                
                let imageElements = product.getAttribute('data-product-images')?.split(',') || [];
                let images = imageElements.map(img => img.replace('{width}x', '1024x')); // Replacing placeholder with valid size
                
                extractedProducts.push({
                    label: title,
                    description: '', // Since description is not available in the current scraping
                    images: images,
                    vendor_id: vendorId,
                    price: {
                        current: parseFloat(price.replace(/[^0-9.]/g, '')),
                        original: discountPrice ? parseFloat(discountPrice.replace(/[^0-9.]/g, '')) : null
                    },
                    meta: {
                        productUrl,
                        rating: parseFloat(rating) || null,
                        reviewCount: parseInt(reviewCount) || 0,
                        sizes,
                        colors
                    }
                });
            });
            return extractedProducts;
        }, IZF_VENDOR_ID);
        
        if (pageProducts.length === 0) {
            hasNextPage = false;
        } else {
            // Get detailed information for each product
            for (const product of pageProducts) {
                if (product.meta.productUrl) {
                    console.log(`Fetching details for: ${product.meta.productUrl}`);
                    const details = await getProductDetails(page, product.meta.productUrl, collection.categoryTags);
                    if (details) {
                        product.description = details.description;
                        product.meta.productDetails = details.additionalDetails;
                        // Combine category tags with extracted tags and product-specific details
                        product.meta.tags = [
                            ...collection.categoryTags,
                            ...details.extractedTags,
                            details.additionalDetails.fit,
                            details.additionalDetails.neck,
                            details.additionalDetails.sleeve,
                            details.additionalDetails.length,
                            details.additionalDetails.printType
                        ].filter(tag => tag && typeof tag === 'string')
                         .map(tag => tag.toLowerCase().trim())
                         .filter((tag, index, self) => self.indexOf(tag) === index); // Remove duplicates
                    }
                }
            }
            
            products = products.concat(pageProducts);
            pageNumber++;
        }
    }
    
    fs.writeFileSync('products.json', JSON.stringify(products, null, 2));
    console.log(`Scraped ${products.length} products and saved to products.json`);

    await browser.close();
}})();
