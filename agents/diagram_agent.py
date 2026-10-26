import re

from agents.llm_agent import client

# Any Mermaid link between nodes: -->, ---, ==>, -.->
LINK = re.compile(r"-->|---|==>|-\.-")


def clean_mermaid_output(diagram):
    if not diagram:
        return None

    # Remove unwanted markdown
    diagram = diagram.replace("```mermaid", "")
    diagram = diagram.replace("```", "")
    diagram = diagram.strip()

    # Force correct starting keyword
    if not diagram.lower().startswith("flowchart"):
        diagram = "flowchart TD\n" + diagram

    return diagram


def generate_mermaid_diagram(text):

    # The answer is HTML; the diagram only needs its text
    text = re.sub(r"<[^>]+>", " ", text)

    prompt = f"""
Draw a professional Mermaid flowchart of the process, workflow or logic explained below.

FORMAT (example for a different topic; copy the format, not the content):
flowchart TD
    A(["Start"]) --> B[/"Read the input"/]
    B --> C["Process the data"]
    C --> D{{"Is the result valid?"}}
    D -->|Yes| E[("Save the result")]
    D -->|No| C
    E --> F(["End"])

STRICT RULES:
- Start with: flowchart TD
- Every line after the first connects nodes with -->; give a node its shape and
  label the first time it appears
- Show how the topic actually works, step by step. Do NOT turn the answer's
  section headings (Definition, Introduction, Advantages, Conclusion...) into nodes
- 8-14 nodes with short labels (2-6 words), each label in double quotes,
  never with double quotes inside
- Shapes: (["..."]) start and end, ["..."] process step,
  {{"...?"}} decision (only a real yes/no question or choice; the label ends with ?),
  [/"..."/] data going in or out, [("...")] stored data such as a dataset or database
- Give every exit of a decision a label, like -->|Yes| and -->|No|
- Node ids are short letters or numbers (A, B, C2); never use end as an id
- No classDef, class or style lines, no explanation, no markdown, no ```

Explanation:

{text}
"""

    messages = [
        {"role": "system", "content": "You draw clear, professional Mermaid flowcharts and output only Mermaid code."},
        {"role": "user", "content": prompt}
    ]

    try:
        raw_output = ""
        for _ in range(2):
            response = client.chat.completions.create(
                model="openai/gpt-oss-120b",
                messages=messages,
                temperature=0,
                max_tokens=1000,
                reasoning_effort="low"  # long thinking can use up max_tokens and leave the diagram empty
            )

            raw_output = response.choices[0].message.content.strip()

            # The model sometimes lists the nodes without connecting them: ask once more
            if LINK.search(raw_output):
                break
            messages += [
                {"role": "assistant", "content": raw_output},
                {"role": "user", "content": "The nodes are not connected. Output the complete flowchart again with --> arrows between the nodes."}
            ]

        return clean_mermaid_output(raw_output)

    except Exception as e:
        print("Mermaid Generation Error:", str(e))

        # Safe fallback diagram
        return """flowchart TD
    A[Start] --> B[Process]
    B --> C[End]
"""
