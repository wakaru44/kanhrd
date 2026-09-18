import { Component, input } from '@angular/core';

/**
 * The frame every lab page renders inside. Its band is the lab's half of
 * the copy exemption (openspec add-labs-surface, "A lab says it is a lab"):
 * lab strings are free of the approved-copy table, so every lab page says
 * it is a lab, on screen, before anything else — a screenshot of one can
 * never pass for the product.
 *
 * Lab strings stay inline here and in each lab. They are deliberately NOT
 * in `shared/copy.ts`.
 */
@Component({
  selector: 'app-lab-frame',
  templateUrl: './lab-frame.html',
  styleUrl: './lab-frame.scss',
})
export class LabFrame {
  /** The lab's path under `/labs`, e.g. `file-explorer/mock1`. */
  readonly name = input.required<string>();
}
