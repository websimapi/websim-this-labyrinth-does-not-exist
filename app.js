const { useState, useEffect, useRef } = React;
const { createRoot } = ReactDOM;

const App = () => {
    const [activeTab, setActiveTab] = useState('gallery');
    const [labyrinths, setLabyrinths] = useState([]);
    const [currentLabyrinth, setCurrentLabyrinth] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        description: ''
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [audioStarted, setAudioStarted] = useState(false);
    const audioRef = useRef(null);
    const room = useRef(new WebsimSocket());

    useEffect(() => {
        audioRef.current = document.getElementById('bgMusic');
        loadLabyrinths();
        
        room.current.collection('labyrinth').subscribe((labyrinths) => {
            setLabyrinths(labyrinths.reverse());
        });
    }, []);
    
    const loadLabyrinths = () => {
        const labyrinths = room.current.collection('labyrinth').getList();
        setLabyrinths(labyrinths.reverse());
    };
    
    const startAudio = () => {
        if (!audioStarted && audioRef.current) {
            audioRef.current.play().catch(e => console.error("Audio playback failed:", e));
            setAudioStarted(true);
        }
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const generateLabyrinth = async () => {
        setError('');
        setSuccess('');
        
        if (!formData.name.trim() || !formData.description.trim()) {
            setError('Please provide both a name and description.');
            return;
        }

        try {
            setIsGenerating(true);
            
            // Generate detailed labyrinth description with LLM
            const descriptionCompletion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are a creative labyrinth designer. Create a detailed description of a labyrinth based on the user's input. Include details about biome, atmosphere, challenges, and unique features.`
                    },
                    {
                        role: "user",
                        content: `Create a labyrinth called "${formData.name}" with this concept: "${formData.description}". Include details about walls, textures, pathways, and atmosphere.`
                    }
                ]
            });
            
            const detailedDescription = descriptionCompletion.content;
            
            // Generate image prompt based on the detailed description
            const imagePromptCompletion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `Create a detailed image generation prompt that would represent the entrance or overview of the labyrinth described. Make it visually compelling and detailed.`
                    },
                    {
                        role: "user",
                        content: `Create an image generation prompt for this labyrinth: ${detailedDescription}`
                    }
                ]
            });
            
            const imagePrompt = imagePromptCompletion.content;
            
            // Generate the actual image
            const result = await websim.imageGen({
                prompt: imagePrompt,
                aspect_ratio: "16:9"
            });
            
            // Generate wall textures for the biome
            const wallTexturePromptCompletion = await websim.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `Create a JSON description of wall textures for this labyrinth. Return a JSON object with properties: primaryColor, secondaryColor, patternType, and textureDescription.`
                    },
                    {
                        role: "user",
                        content: `Based on this labyrinth, create wall texture details in JSON format: ${detailedDescription}`
                    }
                ],
                json: true
            });
            
            const wallTextures = JSON.parse(wallTexturePromptCompletion.content);
            
            // Store the labyrinth data
            const newLabyrinth = await room.current.collection('labyrinth').create({
                name: formData.name,
                userDescription: formData.description,
                detailedDescription: detailedDescription,
                imageUrl: result.url,
                imagePrompt: imagePrompt,
                wallTextures: wallTextures
            });

            loadLabyrinths();
            setFormData({ name: '', description: '' });
            setSuccess('Your labyrinth has been successfully generated!');
        } catch (error) {
            console.error('Error generating labyrinth:', error);
            setError('Failed to generate labyrinth. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const startLabyrinth = (labyrinth) => {
        setCurrentLabyrinth(labyrinth);
        setActiveTab('play');
        startAudio();
        
        // Notify other players you're exploring this labyrinth
        room.current.send({
            type: "labyrinthSelected",
            labyrinthId: labyrinth.id,
            name: labyrinth.name,
            echo: true
        });
    };

    const exitLabyrinth = () => {
        setCurrentLabyrinth(null);
        setActiveTab('gallery');
    };

    return (
        <div className="container">
            <h1 style={{ textAlign: 'center', margin: '2rem 0' }}>This Labyrinth Does Not Exist</h1>
            
            <div className="tabs">
                <button 
                    className={`tab ${activeTab === 'gallery' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('gallery')}
                >
                    Gallery
                </button>
                <button 
                    className={`tab ${activeTab === 'create' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('create')}
                >
                    Create New
                </button>
                {currentLabyrinth && (
                    <button 
                        className={`tab ${activeTab === 'play' ? 'active' : ''}`} 
                        onClick={() => setActiveTab('play')}
                    >
                        Explore "{currentLabyrinth.name}"
                    </button>
                )}
            </div>
            
            {activeTab === 'create' && (
                <div className="create-form">
                    <h2>Create a New Labyrinth</h2>
                    <div className="form-group">
                        <label htmlFor="name">Labyrinth Name</label>
                        <input 
                            type="text" 
                            id="name" 
                            name="name" 
                            value={formData.name} 
                            onChange={handleFormChange} 
                            placeholder="Enter a name for your labyrinth"
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="description">Description / Concept</label>
                        <textarea 
                            id="description" 
                            name="description" 
                            value={formData.description} 
                            onChange={handleFormChange} 
                            placeholder="Describe your labyrinth concept (e.g., 'An ancient mossy stone labyrinth in a haunted forest')"
                        />
                    </div>
                    <button 
                        className="button" 
                        onClick={generateLabyrinth} 
                        disabled={isGenerating}
                    >
                        {isGenerating ? 'Generating...' : 'Generate Labyrinth'}
                    </button>
                    
                    {error && <div className="error">{error}</div>}
                    {success && <div className="success">{success}</div>}
                </div>
            )}
            
            {activeTab === 'gallery' && (
                <div>
                    <h2>Labyrinth Gallery</h2>
                    
                    {labyrinths.length === 0 ? (
                        <div className="loading">No labyrinths found. Create the first one!</div>
                    ) : (
                        <div className="gallery">
                            {labyrinths.map(labyrinth => (
                                <div key={labyrinth.id} className="gallery-item">
                                    <img 
                                        src={labyrinth.imageUrl} 
                                        alt={labyrinth.name} 
                                        className="gallery-image" 
                                    />
                                    <div className="gallery-content">
                                        <h3 className="gallery-title">{labyrinth.name}</h3>
                                        <p className="gallery-text">{labyrinth.userDescription}</p>
                                        <div className="gallery-actions">
                                            <button 
                                                className="button" 
                                                onClick={() => startLabyrinth(labyrinth)}
                                            >
                                                Explore
                                            </button>
                                            <span>by {labyrinth.username}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            
            {activeTab === 'play' && currentLabyrinth && (
                <div>
                    <div className="labyrinth-container" id="labyrinth-container" data-labyrinth-id={currentLabyrinth.id}>
                        <div id="labyrinth-canvas" className="labyrinth-canvas"></div>
                    </div>
                    
                    <div className="mobile-controls">
                        <button id="control-left">←</button>
                        <button id="control-up">↑</button>
                        <button id="control-down">↓</button>
                        <button id="control-right">→</button>
                    </div>
                    
                    <button className="button" onClick={exitLabyrinth} style={{ marginTop: '1rem' }}>
                        Exit Labyrinth
                    </button>
                </div>
            )}
        </div>
    );
};

const root = createRoot(document.getElementById('app'));
root.render(<App />);

