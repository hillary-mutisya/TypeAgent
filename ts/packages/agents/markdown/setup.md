- Experiment with converting PDF to Word then extracting from word.
	- The conversion using COM on a machine that already has Word should work:
	- 
	``` powershell
# Path to the PDF file
$pdfFilePath = "C:\path\to\your\file.pdf"
# Path to save the converted Word file
$wordFilePath = "C:\path\to\your\file.docx"

# Create a Word application object
$wordApp = New-Object -ComObject Word.Application

# Optional: Make Word visible (for debugging or monitoring)
$wordApp.Visible = $false

try {
    # Open the PDF file
    $document = $wordApp.Documents.Open($pdfFilePath)

    # Save the document as a Word file (.docx format)
    $document.SaveAs($wordFilePath, 16) # 16 represents the wdFormatXMLDocument format

    # Close the document
    $document.Close()

    Write-Host "Successfully converted '$pdfFilePath' to '$wordFilePath'"
}
catch {
    Write-Error "An error occurred: $($_.Exception.Message)"
}
finally {
    # Quit the Word application
    $wordApp.Quit()

    # Release the COM object
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($wordApp)
    Remove-Variable wordApp
}
	
```

The same thing can be done with an ActiveXObject package in node.js
```
npm install winax
```

Then run conversion:
``` typescript
import * as winax from 'winax';

/**
 * Converts a PDF file to a Word document using Word's COM automation
 * @param pdfPath Full path to the source PDF file
 * @param docxPath Full path where the Word document will be saved
 * @returns Promise that resolves when conversion is complete
 */
function convertPdfToWord(pdfPath: string, docxPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Create Word application instance
      const word = new winax.Object("Word.Application") as any;
      
      // Optional: Make Word visible during the process
      word.Visible = true;
      
      // Open the PDF file
      // Note: Word must support opening PDF files (most modern versions do)
      const doc = word.Documents.Open(pdfPath);
      
      // Constants for Word document formats
      const WD_FORMAT_DOCUMENT_DEFAULT = 16; // wdFormatDocumentDefault (.docx)
      
      // Save as DOCX format
      doc.SaveAs2(docxPath, WD_FORMAT_DOCUMENT_DEFAULT);
      
      // Close the document
      doc.Close();
      
      // Quit Word application
      word.Quit();
      
      // Release COM objects
      doc.Release();
      word.Release();
      
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

// Example usage
async function main() {
  try {
    const pdfPath = "C:\\path\\to\\document.pdf";
    const docxPath = "C:\\path\\to\\output.docx";
    
    console.log("Starting PDF to Word conversion...");
    await convertPdfToWord(pdfPath, docxPath);
    console.log("Conversion completed successfully!");
  } catch (error) {
    console.error("Conversion failed:", error);
  }
}

// Run the conversion
main();
```


You can then extract data from the Word doc, once again using COM automation
``` typescript

import * as winax from 'winax';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Extracts content (paragraphs, images) from a Word document
 * @param docxPath Path to the Word document
 * @param outputDir Directory to save extracted images
 */
async function extractWordContent(docxPath: string, outputDir: string): Promise<void> {
  let word: any = null;
  let doc: any = null;
  
  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Initialize Word application
    word = new winax.Object("Word.Application");
    word.Visible = false;
    
    // Open the document
    doc = word.Documents.Open(docxPath);
    
    // Get document information
    const pageCount = doc.ComputeStatistics(2); // wdStatisticPages = 2
    console.log(`Total pages: ${pageCount}`);
    
    // Create output object to store results
    const output = {
      totalPages: pageCount,
      paragraphs: [] as string[],
      imageInfo: [] as { index: number, filename: string, width: number, height: number }[]
    };
    
    // Extract paragraphs
    for (let i = 1; i <= doc.Paragraphs.Count; i++) {
      const paragraph = doc.Paragraphs.Item(i);
      const text = paragraph.Range.Text.trim();
      
      if (text) {
        output.paragraphs.push(text);
      }
    }
    
    // Extract inline shapes (images, etc.)
    if (doc.InlineShapes.Count > 0) {
      for (let i = 1; i <= doc.InlineShapes.Count; i++) {
        const shape = doc.InlineShapes.Item(i);
        
        // Check if it's an image
        if (shape.Type === 3 || shape.Type === 4) { // Picture or Linked Picture
          // Save each image
          const imageFilename = `image_${i}.png`;
          const imagePath = path.join(outputDir, imageFilename);
          
          // Save as PNG
          shape.Range.CopyAsPicture();
          
          // Use a temporary shape to save the image
          const tempShape = doc.Shapes.AddPicture(
            "", // LinkToFile
            false, // SaveWithDocument
            true, // Left
            shape.Range, // Range (position)
          );
          
          tempShape.Select();
          word.Selection.CopyAsPicture();
          
          // Save using clipboard to file
          // (Note: This is a simplified approach - in production you might use a more robust method)
          const imgTemp = new winax.Object("MSForms.DataObject");
          imgTemp.SetText("", 0);
          imgTemp.PutInClipboard();
          word.Selection.Paste();
          word.Selection.CopyAsPicture();
          imgTemp.GetFromClipboard();
          
          const fso = new winax.Object("Scripting.FileSystemObject");
          const outStream = fso.CreateTextFile(imagePath, true);
          outStream.Write(imgTemp.GetText());
          outStream.Close();
          
          // Remove the temporary shape
          tempShape.Delete();
          
          // Store image information
          output.imageInfo.push({
            index: i,
            filename: imageFilename,
            width: shape.Width,
            height: shape.Height
          });
        }
      }
    }
    
    // Write the extracted content to a JSON file
    fs.writeFileSync(
      path.join(outputDir, 'extracted_content.json'),
      JSON.stringify(output, null, 2)
    );
    
    console.log(`Extracted ${output.paragraphs.length} paragraphs and ${output.imageInfo.length} images`);
    
  } catch (error) {
    console.error("Error extracting content:", error);
    throw error;
  } finally {
    // Clean up
    if (doc) {
      doc.Close(false); // Don't save changes
      doc.Release();
    }
    if (word) {
      word.Quit();
      word.Release();
    }
  }
}

// Example usage
async function main() {
  const docxPath = 'C:\\path\\to\\document.docx';
  const outputDir = 'C:\\path\\to\\output';
  
  try {
    await extractWordContent(docxPath, outputDir);
    console.log('Content extraction completed successfully');
  } catch (error) {
    console.error('Failed to extract content:', error);
  }
}

main();
```
