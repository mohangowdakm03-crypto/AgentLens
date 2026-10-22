"""
AgentLens - Dataset Curator & Interactive Auditor
A Streamlit app to view, analyze, edit, keep, and delete dataset examples one-by-one.
Compatible with Dataset 1 (Causal Attribution) and Dataset 2 (Prompt Rewriter).
"""

import os
import json
import re
import shutil
from datetime import datetime
import pandas as pd
import streamlit as st
import plotly.express as px

# Page configuration
st.set_page_config(
    page_title="AgentLens — Dataset Curator",
    page_icon="🔍",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS for styling
st.markdown("""
<style>
    .metric-card {
        background-color: #1e1e2f;
        border-radius: 8px;
        padding: 12px;
        border: 1px solid #33334d;
    }
    .badge-scope {
        background-color: #ff9800;
        color: black;
        padding: 3px 8px;
        border-radius: 4px;
        font-weight: bold;
    }
    .badge-drift {
        background-color: #9c27b0;
        color: white;
        padding: 3px 8px;
        border-radius: 4px;
        font-weight: bold;
    }
    .badge-misinterpret {
        background-color: #2196f3;
        color: white;
        padding: 3px 8px;
        border-radius: 4px;
        font-weight: bold;
    }
    .trace-step {
        background-color: #141721;
        border-left: 3px solid #4a69bd;
        padding: 8px 12px;
        margin-bottom: 6px;
        border-radius: 0 4px 4px 0;
        font-family: monospace;
        font-size: 0.9em;
    }
    .trace-deviation {
        background-color: #2b1717;
        border-left: 3px solid #e74c3c;
        padding: 8px 12px;
        margin-bottom: 6px;
        border-radius: 0 4px 4px 0;
        font-family: monospace;
        font-size: 0.9em;
    }
</style>
""", unsafe_allow_html=True)


# ── UTILITY FUNCTIONS ─────────────────────────────────────────────────────────

def find_jsonl_files(base_dir="data"):
    """Find all jsonl files in the project."""
    files = []
    if os.path.exists(base_dir):
        for root, _, filenames in os.walk(base_dir):
            for f in filenames:
                if f.endswith(".jsonl"):
                    files.append(os.path.join(root, f))
    # Also check current root directory
    for f in os.listdir("."):
        if f.endswith(".jsonl") and f not in files:
            files.append(f)
    return sorted(files)


def load_dataset(file_path):
    """Load JSONL file into a list of records with metadata."""
    records = []
    if not os.path.exists(file_path):
        return records

    with open(file_path, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                records.append({
                    "_id": idx,
                    "instruction": data.get("instruction", ""),
                    "input": data.get("input", ""),
                    "output": data.get("output", ""),
                    "_status": "pending",  # 'pending', 'kept', 'modified', 'deleted'
                    "_original": data.copy()
                })
            except Exception as e:
                st.error(f"Error parsing line {idx}: {e}")
    return records


def save_dataset(file_path, records, only_active=True, create_backup=True):
    """Save records back to JSONL file with automatic backup."""
    if create_backup and os.path.exists(file_path):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"{file_path}.{timestamp}.bak"
        shutil.copyfile(file_path, backup_path)

    # Filter out deleted records if only_active is True
    records_to_write = [r for r in records if not (only_active and r.get("_status") == "deleted")]

    with open(file_path, "w", encoding="utf-8") as f:
        for r in records_to_write:
            clean_item = {
                "instruction": r["instruction"],
                "input": r["input"],
                "output": r["output"]
            }
            f.write(json.dumps(clean_item, ensure_ascii=False) + "\n")

    return len(records_to_write)


def parse_metadata(input_str):
    """Extract structured components from the input string."""
    meta = {
        "user_instruction": "",
        "failure_type": "Unknown",
        "deviation_step": None,
        "trace_steps": [],
        "causal_explanation": "",
        "observed_failure": ""
    }

    # Extract user instruction
    match_inst = re.search(r"(?:User|Original) instruction:\s*['\"](.*?)['\"](?:\n|$)", input_str, re.DOTALL)
    if match_inst:
        meta["user_instruction"] = match_inst.group(1).strip()

    # Extract failure type
    match_fail = re.search(r"Failure type:\s*([^\n]+)", input_str)
    if match_fail:
        meta["failure_type"] = match_fail.group(1).strip()

    # Extract deviation step
    match_dev = re.search(r"Deviation detected at:\s*Step\s*(\d+)", input_str)
    if match_dev:
        meta["deviation_step"] = int(match_dev.group(1))

    # Extract observed failure
    match_obs = re.search(r"Observed failure:\s*([^\n]+)", input_str)
    if match_obs:
        meta["observed_failure"] = match_obs.group(1).strip()

    # Extract causal explanation from input (Dataset 2)
    match_causal = re.search(r"Causal explanation:\s*(.*?)(?=\n\nObserved failure:|$)", input_str, re.DOTALL)
    if match_causal:
        meta["causal_explanation"] = match_causal.group(1).strip()

    # Extract agent trace steps (Dataset 1)
    if "Agent trace:" in input_str:
        trace_section = input_str.split("Agent trace:")[-1]
        if "Deviation detected at:" in trace_section:
            trace_section = trace_section.split("Deviation detected at:")[0]

        try:
            # Check if trace is serialized JSON list
            parsed_trace = json.loads(trace_section.strip())
            if isinstance(parsed_trace, list):
                meta["trace_steps"] = parsed_trace
        except Exception:
            # Fallback to regex lines
            lines = [l.strip() for l in trace_section.strip().split("\n") if l.strip()]
            meta["trace_steps"] = lines

    return meta


def parse_output(output_str):
    """Check if output is JSON (Dataset 2) or plain text (Dataset 1)."""
    try:
        data = json.loads(output_str)
        if isinstance(data, dict):
            return "json", data
    except Exception:
        pass
    return "text", output_str


# ── INITIALIZE SESSION STATE ──────────────────────────────────────────────────

if "files" not in st.session_state:
    st.session_state.files = find_jsonl_files()

if "selected_file" not in st.session_state:
    st.session_state.selected_file = st.session_state.files[0] if st.session_state.files else None

if "records" not in st.session_state:
    if st.session_state.selected_file:
        st.session_state.records = load_dataset(st.session_state.selected_file)
    else:
        st.session_state.records = []

if "current_idx" not in st.session_state:
    st.session_state.current_idx = 0

if "filter_status" not in st.session_state:
    st.session_state.filter_status = "All"


# ── SIDEBAR CONTROLS ──────────────────────────────────────────────────────────

st.sidebar.title("🔍 AgentLens Curator")
st.sidebar.markdown("**Post-Hoc Trace Auditor Dataset Manager**")
st.sidebar.markdown("---")

# File Selector
available_files = find_jsonl_files()
if available_files:
    prev_file = st.session_state.selected_file
    selected_file = st.sidebar.selectbox(
        "Select Dataset File",
        options=available_files,
        index=available_files.index(prev_file) if prev_file in available_files else 0
    )

    if selected_file != prev_file:
        st.session_state.selected_file = selected_file
        st.session_state.records = load_dataset(selected_file)
        st.session_state.current_idx = 0
        st.rerun()
else:
    st.sidebar.warning("No .jsonl files found in project.")

# Dataset Stats
records = st.session_state.records
total_count = len(records)
kept_count = sum(1 for r in records if r["_status"] == "kept")
modified_count = sum(1 for r in records if r["_status"] == "modified")
deleted_count = sum(1 for r in records if r["_status"] == "deleted")
pending_count = sum(1 for r in records if r["_status"] == "pending")

st.sidebar.subheader("📊 Dataset Progress")
col_s1, col_s2 = st.sidebar.columns(2)
col_s1.metric("Total", total_count)
col_s1.metric("Kept", kept_count)
col_s2.metric("Pending", pending_count)
col_s2.metric("Deleted", deleted_count)

if total_count > 0:
    reviewed = total_count - pending_count
    st.sidebar.progress(reviewed / total_count, text=f"Reviewed: {reviewed}/{total_count} ({int(reviewed/total_count*100)}%)")

st.sidebar.markdown("---")

# Filter selector
filter_status = st.sidebar.radio(
    "Filter By Status",
    ["All", "Pending Only", "Kept Only", "Modified Only", "Deleted Only"],
    index=0
)
st.session_state.filter_status = filter_status

# Filter indices based on selection
if filter_status == "Pending Only":
    active_indices = [i for i, r in enumerate(records) if r["_status"] == "pending"]
elif filter_status == "Kept Only":
    active_indices = [i for i, r in enumerate(records) if r["_status"] == "kept"]
elif filter_status == "Modified Only":
    active_indices = [i for i, r in enumerate(records) if r["_status"] == "modified"]
elif filter_status == "Deleted Only":
    active_indices = [i for i, r in enumerate(records) if r["_status"] == "deleted"]
else:
    active_indices = list(range(len(records)))

# Actions Sidebar Section
st.sidebar.markdown("---")
st.sidebar.subheader("💾 Save & Backup")

if st.sidebar.button("💾 Save Changes In-Place", type="primary", use_container_width=True):
    if st.session_state.selected_file:
        saved_num = save_dataset(st.session_state.selected_file, st.session_state.records, only_active=True, create_backup=True)
        st.sidebar.success(f"Saved {saved_num} active examples! (.bak backup created)")

export_name = st.sidebar.text_input("Clean Export Filename", value="data/curated_clean.jsonl")
if st.sidebar.button("📤 Export Non-Deleted Only", use_container_width=True):
    saved_num = save_dataset(export_name, st.session_state.records, only_active=True, create_backup=False)
    st.sidebar.success(f"Exported {saved_num} clean examples to {export_name}")


# ── MAIN CONTENT AREA ─────────────────────────────────────────────────────────

if not records:
    st.info("No records loaded. Please select a valid .jsonl file.")
    st.stop()

# Ensure current index is valid
if not active_indices:
    st.warning(f"No examples match the filter: **{filter_status}**.")
    st.stop()

if st.session_state.current_idx not in active_indices:
    st.session_state.current_idx = active_indices[0]

current_idx = st.session_state.current_idx
current_record = records[current_idx]
active_position = active_indices.index(current_idx) + 1

# Tabs for View/Edit, Analysis, and Raw Table
tab1, tab2, tab3 = st.tabs(["🔍 One-by-One Review & Edit", "📊 Dataset Analytics", "📋 Search & Table View"])


# ──────────────────────────────────────────────────────────────────────────────
# TAB 1: ONE-BY-ONE REVIEW & EDIT
# ──────────────────────────────────────────────────────────────────────────────
with tab1:
    # Top Navigation Bar
    nav_col1, nav_col2, nav_col3, nav_col4, nav_col5 = st.columns([1, 1, 3, 1, 1])

    with nav_col1:
        if st.button("⬅️ Previous", disabled=(active_position <= 1), use_container_width=True):
            prev_active_idx = active_indices[active_position - 2]
            st.session_state.current_idx = prev_active_idx
            st.rerun()

    with nav_col2:
        if st.button("Next ➡️", disabled=(active_position >= len(active_indices)), use_container_width=True):
            next_active_idx = active_indices[active_position]
            st.session_state.current_idx = next_active_idx
            st.rerun()

    with nav_col3:
        st.markdown(
            f"<div style='text-align: center; padding-top: 5px; font-weight: bold;'>"
            f"Example {active_position} of {len(active_indices)} (Global Index: #{current_idx})</div>",
            unsafe_allow_html=True
        )

    with nav_col4:
        # Jump directly
        selected_jump = st.number_input(
            "Jump to #",
            min_value=1,
            max_value=len(records),
            value=current_idx + 1,
            label_visibility="collapsed"
        )
        if selected_jump - 1 != current_idx:
            st.session_state.current_idx = selected_jump - 1
            st.rerun()

    with nav_col5:
        # Status Pill
        status = current_record["_status"]
        if status == "kept":
            st.success("Status: KEPT")
        elif status == "modified":
            st.info("Status: MODIFIED")
        elif status == "deleted":
            st.error("Status: DELETED")
        else:
            st.warning("Status: PENDING")

    st.markdown("---")

    # Parse metadata for rich rendering
    meta = parse_metadata(current_record["input"])
    output_type, parsed_out = parse_output(current_record["output"])

    # High-level Header info
    header_col1, header_col2, header_col3 = st.columns([3, 1.5, 1.5])
    with header_col1:
        st.markdown(f"### 🎯 Instruction: *\"{meta['user_instruction'] or 'N/A'}\"*")
    with header_col2:
        fail_type = meta["failure_type"]
        badge_class = "badge-scope" if "Scope" in fail_type else ("badge-drift" if "Drift" in fail_type else "badge-misinterpret")
        st.markdown(f"**Failure Type:** <span class='{badge_class}'>{fail_type}</span>", unsafe_allow_html=True)
    with header_col3:
        if meta["deviation_step"]:
            st.markdown(f"**Deviation Step:** `Step {meta['deviation_step']}`")
        elif meta["observed_failure"]:
            st.markdown(f"**Observed Issue:** *{meta['observed_failure'][:40]}...*")

    st.markdown("<br>", unsafe_allow_html=True)

    # Two column display: Left = Input / Trace, Right = Output / Correction
    col_left, col_right = st.columns(2)

    with col_left:
        st.subheader("📥 Input & Agent Execution Trace")

        # If it's Dataset 1 with trace steps
        if meta["trace_steps"]:
            st.markdown("**Execution Trace:**")
            for step_text in meta["trace_steps"]:
                # Check if this step is the deviation step
                is_deviation = False
                if meta["deviation_step"] and f"Step {meta['deviation_step']}:" in step_text:
                    is_deviation = True

                css_class = "trace-deviation" if is_deviation else "trace-step"
                prefix = "⚠️ [DEVIATION] " if is_deviation else "🔹 "
                st.markdown(f"<div class='{css_class}'>{prefix}{step_text}</div>", unsafe_allow_html=True)
        else:
            # If it's Dataset 2 with causal explanation in input
            if meta["causal_explanation"]:
                st.markdown("**Causal Explanation (Why it failed):**")
                st.info(meta["causal_explanation"])

            if meta["observed_failure"]:
                st.markdown("**Observed Failure:**")
                st.warning(meta["observed_failure"])

        with st.expander("📄 View Full Raw Input Text", expanded=False):
            st.text(current_record["input"])

    with col_right:
        st.subheader("📤 Expected Output")

        if output_type == "text":
            # Dataset 1: Causal Attribution Explanation
            st.markdown("**Causal Attribution (LLM Explanation):**")
            st.success(current_record["output"])

        elif output_type == "json":
            # Dataset 2: Prompt Rewriter Output (Corrected Prompt, Diff, Justification)
            corrected_prompt = parsed_out.get("corrected_prompt", "")
            diff_list = parsed_out.get("diff", [])
            justification = parsed_out.get("justification", "")

            st.markdown("**✨ Corrected User Prompt:**")
            st.code(corrected_prompt, language="markdown")

            if justification:
                st.markdown(f"**💡 Justification:** {justification}")

            if diff_list:
                st.markdown("**🔍 Word-Level Diff:**")
                diff_rows = []
                for d in diff_list:
                    if isinstance(d, dict):
                        diff_rows.append({
                            "Old Phrase": d.get("old", ""),
                            "New Phrase": d.get("new", ""),
                            "Reason": d.get("reason", "")
                        })
                    elif isinstance(d, (list, tuple)) and len(d) >= 3:
                        diff_rows.append({
                            "Old Phrase": d[0],
                            "New Phrase": d[1],
                            "Reason": d[2]
                        })
                if diff_rows:
                    st.dataframe(pd.DataFrame(diff_rows), use_container_width=True, hide_index=True)

        with st.expander("📄 View Full Raw Output Text", expanded=False):
            st.text(current_record["output"])

    st.markdown("---")

    # ── EDIT & ACTION WORKBENCH ───────────────────────────────────────────────
    st.subheader("🛠️ Review & Actions")

    edit_mode = st.checkbox("✏️ Open Live Editor to Modify this Example", value=False)

    if edit_mode:
        with st.form("edit_form"):
            new_instruction = st.text_input("System Instruction", value=current_record["instruction"])
            new_input = st.text_area("Input Prompt / Context", value=current_record["input"], height=160)
            new_output = st.text_area("Output Response (Text or JSON)", value=current_record["output"], height=160)

            submitted = st.form_submit_button("💾 Save Edits for this Example", type="primary")
            if submitted:
                current_record["instruction"] = new_instruction
                current_record["input"] = new_input
                current_record["output"] = new_output
                current_record["_status"] = "modified"
                st.success("Example updated successfully!")
                st.rerun()

    # Action Buttons Bar
    act_col1, act_col2, act_col3, act_col4 = st.columns(4)

    with act_col1:
        if st.button("✅ Keep & Go Next", type="primary", use_container_width=True):
            current_record["_status"] = "kept"
            if active_position < len(active_indices):
                st.session_state.current_idx = active_indices[active_position]
            st.rerun()

    with act_col2:
        if st.button("🗑️ Delete / Exclude", type="secondary", use_container_width=True):
            current_record["_status"] = "deleted"
            if active_position < len(active_indices):
                st.session_state.current_idx = active_indices[active_position]
            st.rerun()

    with act_col3:
        if st.button("↩️ Restore to Pending", use_container_width=True):
            current_record["_status"] = "pending"
            st.rerun()

    with act_col4:
        if st.button("🔄 Reset to Original", use_container_width=True):
            current_record["instruction"] = current_record["_original"]["instruction"]
            current_record["input"] = current_record["_original"]["input"]
            current_record["output"] = current_record["_original"]["output"]
            current_record["_status"] = "pending"
            st.success("Reverted to original state.")
            st.rerun()


# ──────────────────────────────────────────────────────────────────────────────
# TAB 2: DATASET ANALYTICS
# ──────────────────────────────────────────────────────────────────────────────
with tab2:
    st.header("📊 Dataset Health & Distribution Analytics")

    df_meta = []
    for r in records:
        m = parse_metadata(r["input"])
        df_meta.append({
            "id": r["_id"],
            "status": r["_status"],
            "failure_type": m["failure_type"],
            "deviation_step": m["deviation_step"] or 0,
            "instruction_len": len(r["instruction"].split()),
            "input_words": len(r["input"].split()),
            "output_words": len(r["output"].split()),
            "has_trace": len(m["trace_steps"]) > 0
        })
    df = pd.DataFrame(df_meta)

    c1, c2, c3 = st.columns(3)
    with c1:
        # Failure type distribution
        fail_counts = df["failure_type"].value_counts().reset_index()
        fail_counts.columns = ["Failure Type", "Count"]
        fig_fail = px.bar(
            fail_counts,
            x="Failure Type",
            y="Count",
            color="Failure Type",
            title="Distribution by Failure Type",
            color_discrete_sequence=px.colors.qualitative.Bold
        )
        st.plotly_chart(fig_fail, use_container_width=True)

    with c2:
        # Curation status distribution
        status_counts = df["status"].value_counts().reset_index()
        status_counts.columns = ["Status", "Count"]
        fig_status = px.pie(
            status_counts,
            names="Status",
            values="Count",
            title="Curation Review Status",
            color="Status",
            color_discrete_map={
                "pending": "#f39c12",
                "kept": "#2ecc71",
                "modified": "#3498db",
                "deleted": "#e74c3c"
            }
        )
        st.plotly_chart(fig_status, use_container_width=True)

    with c3:
        # Deviation Step distribution (for Dataset 1)
        step_df = df[df["deviation_step"] > 0]
        if not step_df.empty:
            step_counts = step_df["deviation_step"].value_counts().reset_index()
            step_counts.columns = ["Deviation Step", "Count"]
            fig_steps = px.bar(
                step_counts,
                x="Deviation Step",
                y="Count",
                title="Deviation Step Distribution",
                color_discrete_sequence=["#e67e22"]
            )
            st.plotly_chart(fig_steps, use_container_width=True)
        else:
            st.info("No numerical deviation steps detected in this dataset (Dataset 2 focus).")

    # Word count distributions
    st.subheader("📏 Text Length Metrics")
    col_w1, col_w2, col_w3 = st.columns(3)
    col_w1.metric("Avg Input Words", f"{df['input_words'].mean():.1f}")
    col_w2.metric("Avg Output Words", f"{df['output_words'].mean():.1f}")
    col_w3.metric("Max Input Words", f"{df['input_words'].max()}")


# ──────────────────────────────────────────────────────────────────────────────
# TAB 3: SEARCH & TABLE VIEW
# ──────────────────────────────────────────────────────────────────────────────
with tab3:
    st.header("📋 Interactive Search & Table Browser")

    search_query = st.text_input("🔍 Search across instructions, traces, or outputs:", placeholder="e.g., Mysuru, Scope Creep, cart.py...")

    table_data = []
    for r in records:
        m = parse_metadata(r["input"])
        table_data.append({
            "ID": r["_id"],
            "Status": r["_status"].upper(),
            "Failure Type": m["failure_type"],
            "User Instruction": m["user_instruction"],
            "Input Preview": r["input"][:80] + "...",
            "Output Preview": r["output"][:80] + "..."
        })
    df_table = pd.DataFrame(table_data)

    if search_query:
        mask = (
            df_table["User Instruction"].str.contains(search_query, case=False, na=False) |
            df_table["Input Preview"].str.contains(search_query, case=False, na=False) |
            df_table["Output Preview"].str.contains(search_query, case=False, na=False) |
            df_table["Failure Type"].str.contains(search_query, case=False, na=False)
        )
        filtered_df = df_table[mask]
    else:
        filtered_df = df_table

    st.dataframe(filtered_df, use_container_width=True, hide_index=True)

    jump_col1, jump_col2 = st.columns([2, 5])
    with jump_col1:
        target_id = st.number_input("Select ID to jump to in Review tab:", min_value=0, max_value=len(records)-1, value=0)
        if st.button("🚀 Jump to this Example"):
            st.session_state.current_idx = target_id
            st.rerun()
