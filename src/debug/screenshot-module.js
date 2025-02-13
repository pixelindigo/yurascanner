const Jimp = require('jimp');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { program } = require('commander');

// Define chalk color
const errorColor = chalk.bold.red;

// Define Jimp colors
const JimpColors = {
    RED: Jimp.rgbaToInt(255, 0, 0, 255),
    BLUE: Jimp.rgbaToInt(0, 0, 255, 255)
};


class ScreenshotModule {
    constructor(pageWrapper) {
        // Check whether screenshots were enabled
        if (!program.opts().screenshot) {
            return;
        }

        this.page = pageWrapper.getPageObj();
        this.pageWrapper = pageWrapper;

        // Create a folder for all screenshots of the current crawl
        this.screenshotDir = path.resolve(__dirname, '../../output/screenshots/', new Date().toISOString());
        fs.mkdirSync(this.screenshotDir, { recursive: true });
    }


    async takeElementScreenshot(elem, text, filename) {
        // Only take screenshots when explicitly activated
        if (!program.opts().screenshot) {
            return;
        }

        // Scroll to element first (might be outside the viewport)
        await elem.scrollIntoView();

        let boundingRect = await this.#getBoundingClientRect(elem);
        let screenshotFilepath = await this.#takeScreenshot(filename);
        await this.#highlightScreenshot(screenshotFilepath, [boundingRect], JimpColors.RED, text);
    }


    async takeFormScreenshot(form, text, filename) {
        // Only take screenshots when explicitly activated
        if (!program.opts().screenshot) {
            return;
        }

        let boundingRects = [];
        let formElems = await this.pageWrapper.getFormElements(form);

        // Draw a blue border around each form element (and remember the original border attributes!)
        for (let elem of formElems) {
            boundingRects.push(await this.#getBoundingClientRect(elem));
        }


        let screenshotFilepath = await this.#takeScreenshot(filename);
        await this.#highlightScreenshot(screenshotFilepath, boundingRects, JimpColors.BLUE, text);
    }


    async takeStopScreenshot(text, filename) {
        // Only take screenshots when explicitly activated
        if (!program.opts().screenshot) {
            return;
        }

        // Take the underlying screenshot and load it with Jimp to determine the dimensions
        let screenshotFilepath = await this.#takeScreenshot(filename);
        let image = await Jimp.read(screenshotFilepath);

        // We want a red border around the entire screenshot, i.e., a rectangle using these values
        let screenshotRect = {
            x: 0,
            y: 0,
            width: image.bitmap.width,
            height: image.bitmap.height
        }
        await this.#highlightScreenshot(screenshotFilepath, [screenshotRect], JimpColors.RED, text);
    }


    async #highlightScreenshot(screenshotFilepath, boundingRects, color, text) {
        // Load the screenshot with Jimp and draw all the rectangles
        let image = await Jimp.read(screenshotFilepath);
        for (let boundingRect of boundingRects) {
            await this.#drawRectangle(image, boundingRect, color);
        }

        // Add the task description
        await this.#addTextToImage(image, text);

        // Save the edited image
        await image.writeAsync(screenshotFilepath);
    }


    async #takeScreenshot(filename) {
        let screenshotFilepath = path.join(this.screenshotDir, filename);
        await this.page.screenshot({ path: screenshotFilepath });
        return screenshotFilepath;
    }


    async #addTextToImage(image, text) {
        try {
            let font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
            await image.print(
                font,
                0,
                1000,
                {
                    text: text,
                    alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER
                },
                image.bitmap.width,
                image.bitmap.height);
        } catch (e) {
            console.log(errorColor('[!] Error occurred when printing task with Jimp:\n', e));
        }
    }


    async #getBoundingClientRect(elem) {
        return await elem.evaluate((el) => {
            let { x, y, width, height } = el.getBoundingClientRect();
            return { x, y, width, height};
        });
    }


    async #drawRectangle(image, boundingRect, color) {
        try {
            const { x, y, width, height } = boundingRect;
            const borderWidth = 3;

            // Iterate through the pixels in the rectangle
            for (let currX = x; currX < x + width; currX++) {
                for (let currY = y; currY < y + height; currY++) {
                    // Check if the current pixel is on the border
                    if (
                        currX < x + borderWidth ||
                        currX >= x + width - borderWidth ||
                        currY < y + borderWidth ||
                        currY >= y + height - borderWidth
                    ) {
                        // Set the pixel color to red (255, 0, 0)
                        image.setPixelColor(color, currX, currY);
                    }
                }
            }
        } catch (error) {
            console.log(errorColor('[!] Error occurred while drawing rectangle with Jimp:', error));
        }
    }
}

module.exports = ScreenshotModule