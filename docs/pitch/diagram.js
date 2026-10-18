function renderDiagram({ groups = [], boxes, edges, width, height }) {
	const stage = document.getElementById("stage");
	stage.style.width = `${width}px`;
	stage.style.height = `${height}px`;

	for (const g of groups) {
		const el = document.createElement("div");
		el.className = `group ${g.kind ?? ""}`;
		Object.assign(el.style, {
			left: `${g.x}px`,
			top: `${g.y}px`,
			width: `${g.w}px`,
			height: `${g.h}px`,
		});
		el.innerHTML = `<span class="group-label">${g.label}</span>`;
		stage.appendChild(el);
	}

	const byId = {};
	for (const b of boxes) {
		byId[b.id] = b;
		const el = document.createElement("div");
		el.className = `box ${b.kind ?? ""}`;
		Object.assign(el.style, {
			left: `${b.x}px`,
			top: `${b.y}px`,
			width: `${b.w}px`,
			height: `${b.h}px`,
		});
		const items = b.items
			? `<ul>${b.items.map((i) => `<li>${i}</li>`).join("")}</ul>`
			: "";
		const sub = b.sub ? `<p class="sub">${b.sub}</p>` : "";
		const tag = b.tag ? `<span class="tag">${b.tag}</span>` : "";
		el.innerHTML = `${tag}<p class="title">${b.title}</p>${sub}${items}`;
		stage.appendChild(el);
	}

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("width", width);
	svg.setAttribute("height", height);
	svg.innerHTML = `<defs>
		<marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#3c4043"/></marker>
		<marker id="arrow-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#1a73e8"/></marker>
		<marker id="arrow-amber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#b06000"/></marker>
	</defs>`;
	stage.appendChild(svg);

	const anchor = (b, side, t = 0.5) => {
		if (side === "left") return [b.x, b.y + b.h * t];
		if (side === "right") return [b.x + b.w, b.y + b.h * t];
		if (side === "top") return [b.x + b.w * t, b.y];
		return [b.x + b.w * t, b.y + b.h];
	};

	for (const e of edges) {
		let d;
		let mid;
		if (e.path) {
			d = e.path;
			mid = e.labelAt;
		} else {
			const a = byId[e.from];
			const b = byId[e.to];
			const [x1, y1] = anchor(a, e.fromSide ?? "right", e.ft ?? 0.5);
			const [x2, y2] = anchor(b, e.toSide ?? "left", e.tt ?? 0.5);
			const fs = e.fromSide ?? "right";
			const ts = e.toSide ?? "left";
			const horiz = (s) => s === "left" || s === "right";
			if (horiz(fs) && horiz(ts)) {
				const mx = e.via ?? (x1 + x2) / 2;
				d = y1 === y2 ? `M${x1} ${y1} H${x2}` : `M${x1} ${y1} H${mx} V${y2} H${x2}`;
				mid = [mx, (y1 + y2) / 2];
				if (y1 === y2) mid = [(x1 + x2) / 2, y1];
			} else if (!horiz(fs) && !horiz(ts)) {
				const my = e.via ?? (y1 + y2) / 2;
				d = x1 === x2 ? `M${x1} ${y1} V${y2}` : `M${x1} ${y1} V${my} H${x2} V${y2}`;
				mid = x1 === x2 ? [x1, (y1 + y2) / 2] : [(x1 + x2) / 2, my];
			} else if (horiz(fs)) {
				d = `M${x1} ${y1} H${x2} V${y2}`;
				mid = [(x1 + x2) / 2, y1];
			} else {
				d = `M${x1} ${y1} V${y2} H${x2}`;
				mid = [x1, (y1 + y2) / 2];
			}
		}
		const color =
			e.tone === "blue" ? "#1a73e8" : e.tone === "amber" ? "#b06000" : "#3c4043";
		const marker =
			e.tone === "blue" ? "arrow-blue" : e.tone === "amber" ? "arrow-amber" : "arrow";
		const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute("d", d);
		path.setAttribute("fill", "none");
		path.setAttribute("stroke", color);
		path.setAttribute("stroke-width", "2.25");
		path.setAttribute("stroke-linejoin", "round");
		if (e.dashed) path.setAttribute("stroke-dasharray", "7 6");
		if (!e.noArrow) path.setAttribute("marker-end", `url(#${marker})`);
		if (e.both) path.setAttribute("marker-start", `url(#${marker})`);
		svg.appendChild(path);
		if (e.label && mid) {
			const label = document.createElement("div");
			label.className = `edge-label ${e.tone ?? ""}`;
			label.textContent = e.label;
			const [lx, ly] = mid;
			Object.assign(label.style, {
				left: `${lx + (e.dx ?? 0)}px`,
				top: `${ly + (e.dy ?? 0)}px`,
			});
			stage.appendChild(label);
		}
	}
}
