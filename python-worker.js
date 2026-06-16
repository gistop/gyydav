let pyodide;

async function initialize() {
  self.postMessage({ type: "progress", percent: 6, message: "正在下载 Pyodide 启动器..." });
  importScripts("https://cdn.jsdelivr.net/pyodide/v0.29.3/full/pyodide.js");
  self.postMessage({ type: "progress", percent: 20, message: "正在初始化 Python/WASM 运行时..." });
  pyodide = await loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.29.3/full/"
  });
  self.postMessage({ type: "progress", percent: 58, message: "正在加载 NumPy..." });
  await pyodide.loadPackage("numpy");
  self.postMessage({ type: "progress", percent: 74, message: "正在加载 Matplotlib..." });
  await pyodide.loadPackage("matplotlib");
  self.postMessage({ type: "progress", percent: 94, message: "正在配置无界面绘图后端..." });
  await pyodide.runPythonAsync(`
import numpy
import matplotlib
matplotlib.use("agg")
`);
  self.postMessage({ type: "ready" });
}

const pythonCode = `
import io
import json
import base64
import numpy as np
import matplotlib
matplotlib.use("agg")
import matplotlib.pyplot as plt

p = json.loads(params_json)
d = p["dataset"]
plot_name = d.get("plotName", d["id"])
rng = np.random.default_rng(p["seed"])
n = int(p["points"])
noise = float(p["noise"])
x = np.linspace(0, 24, n)
groups = np.array(["A", "B", "C"])[np.arange(n) % 3]
group_offsets = np.choose(np.arange(n) % 3, [-1.8, 0.4, 2.1])
lon = 116.18 + rng.random(n) * 0.72
lat = 39.72 + rng.random(n) * 0.46
hot_a = np.exp(-(((lon - 116.46) / 0.13) ** 2 + ((lat - 39.94) / 0.09) ** 2))
hot_b = np.exp(-(((lon - 116.72) / 0.1) ** 2 + ((lat - 39.82) / 0.07) ** 2))
spatial_signal = hot_a * 18 + hot_b * 11 - np.hypot(lon - 116.5, lat - 39.9) * 9
seasonal = np.sin(x * 0.72) * float(d["periodic"]) + np.cos(x * 0.19) * float(d["periodic"]) * 0.42
y = float(d["baseline"]) + float(d["trend"]) * x + seasonal + group_offsets + spatial_signal * 0.28 + rng.normal(0, noise, n)
intensity = np.maximum(0, float(d["baseline"]) + spatial_signal + seasonal * 0.45 + rng.normal(0, noise, n))

plt.style.use("seaborn-v0_8-whitegrid")
fig, ax = plt.subplots(figsize=(10.2, 5.9), dpi=160)
fig.patch.set_facecolor("#ffffff")
ax.set_facecolor("#fbfcfb")

chart_type = p["chartType"]
if chart_type == "line":
    window = max(7, n // 18)
    kernel = np.ones(window) / window
    smooth = np.convolve(y, kernel, mode="same")
    edge = window // 2
    ax.plot(x, y, color="#8eb8a7", linewidth=1.0, alpha=0.52, label="Observed")
    ax.plot(x[edge:-edge], smooth[edge:-edge], color="#167d59", linewidth=2.6, label="Rolling mean")
    ax.fill_between(
        x[edge:-edge],
        smooth[edge:-edge] - noise * 1.35,
        smooth[edge:-edge] + noise * 1.35,
        color="#167d59",
        alpha=0.13,
        label="Local interval"
    )
    plot_title = f"{plot_name} - Trend and Interval"
elif chart_type == "scatter":
    coef = np.polyfit(x, y, 1)
    fit = np.polyval(coef, x)
    ax.scatter(x, y, s=24, color="#2d6cdf", alpha=0.64, edgecolors="white", linewidths=0.35)
    ax.plot(x, fit, color="#e7842e", linewidth=2.5, label=f"Linear fit: slope {coef[0]:.2f}")
    plot_title = f"{plot_name} - Regression"
elif chart_type == "hist":
    ax.hist(y, bins=max(10, int(np.sqrt(n))), color="#2d6cdf", alpha=0.82, edgecolor="white")
    ax.axvline(np.mean(y), color="#e7842e", linewidth=2.5, label=f"Mean {np.mean(y):.2f}")
    ax.axvline(np.median(y), color="#167d59", linewidth=2.1, linestyle="--", label=f"Median {np.median(y):.2f}")
    plot_title = f"{plot_name} - Distribution"
elif chart_type == "spatial":
    points = ax.scatter(lon, lat, c=intensity, s=np.clip(intensity * 3.5, 18, 120), cmap="turbo", alpha=0.78, edgecolors="white", linewidths=0.35)
    fig.colorbar(points, ax=ax, label="Spatial intensity", fraction=0.036, pad=0.03)
    ax.set_xlabel("Longitude")
    ax.set_ylabel("Latitude")
    plot_title = f"{plot_name} - Spatial Hotspots"
else:
    grouped = [y[groups == g] for g in ["A", "B", "C"]]
    box = ax.boxplot(grouped, patch_artist=True, labels=["A", "B", "C"])
    colors = ["#167d59", "#2d6cdf", "#e7842e"]
    for patch, color in zip(box["boxes"], colors):
        patch.set_facecolor(color)
        patch.set_alpha(0.7)
        patch.set_edgecolor("#263b33")
    for median in box["medians"]:
        median.set_color("#ffffff")
        median.set_linewidth(2)
    ax.set_xlabel("Experimental group")
    plot_title = f"{plot_name} - Group Comparison"

if chart_type not in ["box", "spatial"]:
    ax.set_xlabel("Observation index / time")
if chart_type != "spatial":
    ax.set_ylabel("Synthetic measurement" if chart_type != "hist" else "Frequency")
ax.set_title(plot_title, loc="left", fontsize=15, fontweight="bold", pad=14)
ax.text(0.99, 1.02, "Generated in browser with Pyodide + Matplotlib",
        transform=ax.transAxes, ha="right", va="bottom", fontsize=8.5, color="#697570")
ax.spines[["top", "right"]].set_visible(False)
ax.grid(color="#e7ece9", linewidth=0.8)
ax.legend(frameon=False, loc="upper left")
fig.tight_layout()

buffer = io.BytesIO()
fig.savefig(buffer, format="png", bbox_inches="tight", facecolor=fig.get_facecolor())
plt.close(fig)

coef = np.polyfit(x, y, 1)
fit = np.polyval(coef, x)
ss_res = float(np.sum((y - fit) ** 2))
ss_tot = float(np.sum((y - np.mean(y)) ** 2))
r2 = 1 - ss_res / ss_tot if ss_tot else 0
corr = float(np.corrcoef(x, y)[0, 1])

result = {
    "image": base64.b64encode(buffer.getvalue()).decode("ascii"),
    "title": f"{d['name']}可视化分析",
    "description": f"{d['field']}虚拟数据，样本 {n}，噪声 {noise:.1f}，随机种子 {p['seed']}。全部计算与绘图均在浏览器端完成。",
    "series": [
        {"i": i + 1, "x": float(x[i]), "y": float(y[i]), "lon": float(lon[i]), "lat": float(lat[i]), "intensity": float(intensity[i]), "group": str(groups[i])}
        for i in range(n)
    ],
    "stats": {
        "count": int(n),
        "mean": f"{np.mean(y):.2f}",
        "std": f"{np.std(y):.2f}",
        "corr": f"{corr:.3f}",
        "min": f"{np.min(y):.2f}",
        "max": f"{np.max(y):.2f}",
        "slope": f"{coef[0]:.3f}",
        "r2": f"{r2:.3f}"
    },
    "rows": [
        {"i": i + 1, "x": f"{x[i]:.2f}", "y": f"{y[i]:.2f}", "lon": f"{lon[i]:.5f}", "lat": f"{lat[i]:.5f}", "intensity": f"{intensity[i]:.2f}", "group": str(groups[i])}
        for i in range(min(50, n))
    ]
}
json.dumps(result, ensure_ascii=False)
`;

self.onmessage = async ({ data }) => {
  if (data.type !== "run") return;
  try {
    pyodide.globals.set("params_json", JSON.stringify(data.params));
    const result = await pyodide.runPythonAsync(pythonCode);
    self.postMessage({ type: "result", ...JSON.parse(result) });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message });
  }
};

initialize().catch((error) => {
  self.postMessage({ type: "error", message: `Pyodide 初始化失败：${error.message}` });
});
