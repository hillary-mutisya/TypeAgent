// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { AnnotationCreationData } from "../core/annotationManager";

/**
 * Question form component for creating question annotations
 */
export class QuestionForm {
    private container: HTMLElement;
    private onSubmit: (question: string, data: AnnotationCreationData) => void;
    private onCancel: () => void;
    private annotationData: AnnotationCreationData;

    constructor(
        annotationData: AnnotationCreationData,
        onSubmit: (question: string, data: AnnotationCreationData) => void,
        onCancel: () => void,
    ) {
        this.annotationData = annotationData;
        this.onSubmit = onSubmit;
        this.onCancel = onCancel;
        this.container = this.createFormElement();
    }

    /**
     * Create the form DOM element
     */
    private createFormElement(): HTMLElement {
        const form = document.createElement("div");
        form.className = "question-form";

        const contextType = this.annotationData.screenshotData ? "screenshot" : "text";
        const contextDescription = this.getContextDescription();

        form.innerHTML = `
            <div class="question-form-content">
                <div class="form-header">
                    <h3>Ask a Question</h3>
                    <button class="close-btn" type="button">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="context-preview">
                    <div class="context-label">
                        <i class="fas fa-${contextType === "text" ? "quote-left" : "image"}"></i>
                        ${contextDescription}
                    </div>
                    ${this.createContextPreview()}
                </div>

                <div class="question-input-section">
                    <label for="question-input">Your Question</label>
                    <textarea 
                        id="question-input" 
                        placeholder="What would you like to know about this content?"
                        rows="3"
                        required
                    ></textarea>
                    <div class="input-help">
                        Ask anything about the ${contextType === "text" ? "selected text" : "image"} - the AI will analyze the content and provide a detailed response.
                    </div>
                </div>

                <div class="form-actions">
                    <button class="cancel-btn" type="button">Cancel</button>
                    <button class="submit-btn" type="submit" disabled>
                        <i class="fas fa-paper-plane"></i>
                        Ask Question
                    </button>
                </div>
            </div>
        `;

        this.setupEventListeners(form);
        return form;
    }

    /**
     * Get context description for display
     */
    private getContextDescription(): string {
        if (this.annotationData.screenshotData) {
            return `Screenshot from page ${this.annotationData.selection.pageNumber}`;
        } else {
            const textLength = this.annotationData.selection.text?.length || 0;
            return `Text selection (${textLength} characters) from page ${this.annotationData.selection.pageNumber}`;
        }
    }

    /**
     * Create context preview element
     */
    private createContextPreview(): string {
        if (this.annotationData.screenshotData) {
            return `
                <div class="screenshot-preview">
                    <img src="${this.annotationData.screenshotData.imageData}" alt="Selected area" />
                </div>
            `;
        } else {
            const text = this.annotationData.selection.text || "";
            const truncatedText = text.length > 200 ? text.substring(0, 200) + "..." : text;
            return `
                <div class="text-preview">
                    "${this.escapeHtml(truncatedText)}"
                </div>
            `;
        }
    }

    /**
     * Escape HTML for safe display
     */
    private escapeHtml(text: string): string {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Set up event listeners
     */
    private setupEventListeners(form: HTMLElement): void {
        const questionInput = form.querySelector("#question-input") as HTMLTextAreaElement;
        const submitBtn = form.querySelector(".submit-btn") as HTMLButtonElement;
        const cancelBtn = form.querySelector(".cancel-btn") as HTMLButtonElement;
        const closeBtn = form.querySelector(".close-btn") as HTMLButtonElement;

        // Enable submit button when text is entered
        questionInput.addEventListener("input", () => {
            const hasText = questionInput.value.trim().length > 0;
            submitBtn.disabled = !hasText;
            submitBtn.classList.toggle("enabled", hasText);
        });

        // Handle form submission
        submitBtn.addEventListener("click", (e) => {
            e.preventDefault();
            const question = questionInput.value.trim();
            if (question) {
                this.onSubmit(question, this.annotationData);
            }
        });

        // Handle cancel/close
        const handleCancel = () => {
            this.onCancel();
        };

        cancelBtn.addEventListener("click", handleCancel);
        closeBtn.addEventListener("click", handleCancel);

        // Handle escape key
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                handleCancel();
            }
        });

        // Auto-focus on the textarea
        setTimeout(() => {
            questionInput.focus();
        }, 100);
    }

    /**
     * Get the form element
     */
    getElement(): HTMLElement {
        return this.container;
    }

    /**
     * Show the form
     */
    show(): void {
        document.body.appendChild(this.container);
        // Trigger animation
        requestAnimationFrame(() => {
            this.container.classList.add("visible");
        });
    }

    /**
     * Hide and remove the form
     */
    hide(): void {
        this.container.classList.remove("visible");
        setTimeout(() => {
            if (this.container.parentNode) {
                this.container.parentNode.removeChild(this.container);
            }
        }, 300);
    }
}
