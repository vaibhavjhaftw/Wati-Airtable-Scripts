async function main() {
    let table  = base.getTable("Post Interested Call");
    let record = await input.recordAsync("", table);
    if (!record) return;
  
    // 1️⃣ Read key fields
    let postStatus = record.getCellValueAsString("Post TBR Status")   || "";
    let convoStat  = record.getCellValueAsString("conversationStatus")|| "";
    let jdSlug     = record.getCellValueAsString("JD Link Code (from jdUidMapper)") || "";
    let phone      = record.getCellValueAsString("phoneNumber")       || "";
  
    // 2️⃣ Map Post TBR Status → template
    let template;
    switch (postStatus) {
      case "To Be Called":
        if (convoStat === "Intro Call") {
          template = jdSlug ? "scheduling_intro_jd" : "scheduling_intro_nojdv1";
        } else {
          template = "scheduling_nextinterview";
        }
        break;
      case "Tried calling but couldn't connect (1) & WA Sent":
      case "Tried calling but couldn't connect (2) & WA Sent":
        template = "scheduling_fu1";
        break;
      case "Tried calling but couldn't connect (3) & WA Sent":
      case "Tried calling but couldn't connect (4) & WA Sent":
        template = "scheduling_fu2v1";
        break;
      case "Scheduling Completed (Interview Time Received)":
        template = "scheduling_completed";
        break;
  
      // ✳️ New rescheduling cases
      case "Candidate Cancelled (To Be Rescheduled)":
      case "Company Cancelled (To Be Rescheduled)":
      case "Candidate No Show (To Be Rescheduled)":
      case "Company No Show (To Be Rescheduled)":
        template = "rescheduling_availability";
        break;
  
      default:
        await table.updateRecordAsync(record.id, {
          "Error Details": `No template for Post TBR Status “${postStatus}”`
        });
        return;
    }
  
    // 3️⃣ Validate phone
    if (!phone) {
      await table.updateRecordAsync(record.id, {
        "Error Details": "Missing phoneNumber"
      });
      return;
    }
  
    // 4️⃣ Build parameters
    let params = [
      { name: "candidateName",      value: record.getCellValueAsString("Candidate Name") },
      { name: "candidateFirstName", value: record.getCellValueAsString("candidateFirstName Formatted") },
      { name: "CompanyName",        value: record.getCellValueAsString("Company Name Formatted") },
      { name: "InterviewStage",     value: convoStat },
      { name: "AvailableSlots",     value: record.getCellValueAsString("Available Slots") || "" },
      { name: "publicIdentifier",   value: record.getCellValueAsString("publicIdentifier") }
    ];
    if (template.startsWith("scheduling_intro")) {
      params.push({ name: "JDLinkCode", value: jdSlug });
    }
  
    // 5️⃣ Send via WATI
    let resp = await fetch(
      `https://live-mt-server.wati.io/420619/api/v2/sendTemplateMessage?whatsappNumber=${phone}`,
      {
        method: "POST",
        headers: {
          "Authorization": "API Key Here", //REMOVED API KEY - PUBLIC REPO
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          template_name:  template,
          broadcast_name: "Scheduling",
          parameters:     params
        })
      }
    );
    let raw = await resp.text();
    let result = {};
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error('Invalid/missing JSON:', raw);
    }
  
    // 6️⃣ Update row & UI feedback
    let update = {};
    if (resp.ok && result.result) {
      update["Wati Status"]        = { name: "WA Sent" };
      update["watiLocalMessageId"] = result.receivers?.[0]?.localMessageId || "";
      await table.updateRecordAsync(record.id, update);
      output.markdown("✅ **Message has been sent!**");
    } else {
  let errMsg = result.message || resp.statusText || `HTTP ${resp.status}`;
  console.log("🔴 WATI response raw:", raw);
  console.log("🔴 Parsed result:", result);
  console.log("🔴 HTTP status:", resp.status, resp.statusText);
  update["Wati Status"] = { name: "WA Failed" };
  update["Error Details"] = errMsg;
  await table.updateRecordAsync(record.id, update);
  output.markdown(`❌ **Failed to send message!** ${errMsg}`);
}

  }
  
  await main();
  
