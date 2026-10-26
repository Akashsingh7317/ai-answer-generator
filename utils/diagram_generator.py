import matplotlib
matplotlib.use("Agg")   # 🔥 IMPORTANT for Flask / Windows

import matplotlib.pyplot as plt
import base64
from io import BytesIO


def generate_diagram(answer_text, title="Diagram"):

    try:
        if not answer_text:
            return None

        # Extract ASCII diagram
        if "<pre>" in answer_text and "</pre>" in answer_text:
            start = answer_text.find("<pre>") + 5
            end = answer_text.find("</pre>")
            diagram_text = answer_text[start:end].strip()
        else:
            return None   # Only generate if <pre> exists

        if not diagram_text:
            return None

        # Create figure
        fig = plt.figure(figsize=(8, 6))

        plt.text(
            0.5,
            0.5,
            diagram_text,
            fontsize=10,
            ha="center",
            va="center",
            family="monospace"
        )

        plt.axis("off")
        plt.title(title)

        # Convert to Base64
        buffer = BytesIO()
        plt.savefig(buffer, format="png", bbox_inches="tight")
        buffer.seek(0)

        image_base64 = base64.b64encode(buffer.read()).decode("utf-8")

        plt.close(fig)

        return image_base64

    except Exception as e:
        print("Diagram Error:", e)
        return None