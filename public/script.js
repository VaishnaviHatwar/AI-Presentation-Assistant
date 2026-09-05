const chat=document.getElementById("chat-messages"),form=document.getElementById("chat-form"),input=document.getElementById("message"),send=document.getElementById("send");let previousInteractionId=null;

function addMessage(text,role,options={}){
    const row=document.createElement("div");
    row.className=`message-row ${role}`;

    const bubble=document.createElement("div");
    bubble.className="bubble";

    if(role==="ai"){
        const safe=text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        bubble.innerHTML=safe
            .replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>")
            .replace(/^###\s?(.*)$/gm,"<strong>$1</strong>")
            .replace(/^##\s?(.*)$/gm,"<strong>$1</strong>")
            .replace(/^#\s?(.*)$/gm,"<strong>$1</strong>");
    }else{
        bubble.textContent=text;
    }

    if(role === "ai" && options.canGeneratePresentation){
        const action = document.createElement("button");
        action.type = "button";
        action.className = "download-ppt";
        action.textContent = "Download Presentation";

        action.addEventListener("click", async () => {
            action.disabled = true;
            action.textContent = "Creating Presentation…";
            try{
                const response = await fetch("/api/generate-ppt", {
                    method: "POST",
                    headers: {"Content-Type":"application/json"},
                    body: JSON.stringify({
                        content: text,
                        title: options.title || "PresentationAI Presentation"
                    })
                });

                if(!response.ok){
                    let message = "Could not create the presentation.";
                    try {
                        const data = await response.json();
                        message = data.error || message;
                    } catch {}
                    throw new Error(message);
                }

                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${(options.title || "PresentationAI-Presentation")
                    .replace(/[^a-z0-9-_ ]/gi, "")
                    .trim()
                    .replace(/\s+/g, "-") || "PresentationAI-Presentation"}.pptx`;

                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);

                action.textContent = "Presentation Downloaded ✓";
            }catch(error){
                action.textContent = "Try Again";
                alert(error.message || "Could not create the presentation.");
            }finally{
                action.disabled = false;
            }
        });

        // Button remains inside the AI response bubble.
        bubble.appendChild(action);
    }

    row.appendChild(bubble);
    chat.appendChild(row);
    chat.scrollTop=chat.scrollHeight;
}

function typing(){
    const row=document.createElement("div");
    row.id="typing-row";
    row.className="message-row ai";
    row.innerHTML='<div class="bubble typing"><i></i><i></i><i></i></div>';
    chat.appendChild(row);
    chat.scrollTop=chat.scrollHeight;
}


function getPresentationTitle(message){
    const match = message.match(/(?:on|about|for|regarding)\s+(.+?)(?:\.|$)/i);
    if(match) return match[1].trim().replace(/\s+/g," ").slice(0,80);
    return "PresentationAI Presentation";
}

async function sendMessage(message){
    document.querySelector("#chat-messages .welcome")?.remove();
    addMessage(message,"user");
    typing();

    input.value="";
    input.style.height="auto";
    send.disabled=true;

    try{
        const r=await fetch("/api/chat",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
                message,
                previousInteractionId
            })
        });

        const data=await r.json();

        document.getElementById("typing-row")?.remove();

        if(!r.ok){
            addMessage(data.error||"Something went wrong.","ai");
            return;
        }

        previousInteractionId=data.interactionId||previousInteractionId;
        addMessage(data.text,"ai",{
            canGeneratePresentation: /(?:create|make|generate|build|prepare|draft|design|need|want)[\s\S]*(?:presentation|presentations|powerpoint|pptx|slide deck|slides)|(?:presentation|presentations|powerpoint|pptx|slide deck|slides)[\s\S]*(?:create|make|generate|build|prepare|draft|design)/i.test(message),
            title: getPresentationTitle(message)
        });

    }catch(e){
        document.getElementById("typing-row")?.remove();
        addMessage(
            "I couldn't connect to the server. Make sure npm start is running.",
            "ai"
        );
    }finally{
        send.disabled=false;
        input.focus();
    }
}

form.addEventListener("submit",e=>{
    e.preventDefault();

    const m=input.value.trim();

    if(m&&!send.disabled){
        sendMessage(m);
    }
});

input.addEventListener("keydown",e=>{
    if(e.key==="Enter"&&!e.shiftKey){
        e.preventDefault();
        form.requestSubmit();
    }
});

input.addEventListener("input",()=>{
    input.style.height="auto";
    input.style.height=Math.min(input.scrollHeight,150)+"px";
});

document.querySelectorAll(".examples button").forEach(b=>{
    b.onclick=()=>{
        input.value=b.dataset.prompt;
        input.focus();
        input.style.height="auto";
        input.style.height=Math.min(input.scrollHeight,150)+"px";
    }
});