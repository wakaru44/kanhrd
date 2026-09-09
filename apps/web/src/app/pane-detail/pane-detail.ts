import { Component, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { map } from "rxjs";

/** Tier-1 placeholder: no terminal, no lifecycle actions. Tier 2 replaces this. */
@Component({
  selector: "app-pane-detail",
  imports: [RouterLink],
  templateUrl: "./pane-detail.html",
  styleUrl: "./pane-detail.scss",
})
export class PaneDetail {
  private readonly route = inject(ActivatedRoute);

  protected readonly host = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("host") ?? "")),
    { initialValue: "" },
  );
  protected readonly id = toSignal(
    this.route.paramMap.pipe(map((params) => params.get("id") ?? "")),
    { initialValue: "" },
  );
}
