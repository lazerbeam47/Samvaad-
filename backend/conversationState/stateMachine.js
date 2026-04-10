const {STATES,TRANSITIONS}=require("./stateDefinitions");
const {scoreSignals}=require("./riskScore");
const stateStore=require("./stateStore");

function init(sessionId){
    stateStore.initState(sessionId);
}

function processNLU(sessionId,nluOutput){
    const state=stateStore.getState(sessionId);
    if(!state)return null;

    const {risk,opportunity}=scoreSignals(nluOutput);

    //Decide state transition based on NLU intent
    let nextState=state.currentState;

    if(risk>60)nextState=STATES.ESCALATION;
    else if(nluOutput.intent==="objection")nextState=STATES.OBJECTION;
    else if(nluOutput.intent==="purchase")nextState=STATES.DECISION;

    if(nextState!==state.currentState){
        stateStore.updateState(sessionId,{
            currentState:nextState,
            lastStateChangeAt:Data.now(),
        });
    }

    stateStore.updateState(sessionId,{
        riskScore:risk,
        opportunityScore:opportunity,
    });

    return {
        statae:nextState,
        risk,
        opportunity,
    };
}

function clear(sessionId){
    stateStore.clearState(sessionId);
}

module.exports={init,processNLU,clear};
