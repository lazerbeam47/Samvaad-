const store=new Map();

function initState(sessionId){
    store.set(sessionId,{
        currentState:"opening",
        lastStateChangeAt:Date.now(),
        riskScore:0,
        opportunityScore:0,
    });
}

function getState(sessionId){
    return store.get(sessionId);
}

function updateState(sessionId,newState){
    const state=store.get(sessionId);
    if(!state)return;
    Object.assign(state,updates);
}

function clearState(sessionId){
    store.delete(sessionId);
}

module.exports={
    initState,
    getState,
    updateState,
    clearState,
};