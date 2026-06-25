package com.doubledeltas.mrdbridge.docker;

public class DockerContainer {
    private final String id;
    private final String name;
    private final String image;
    private final String status;

    public DockerContainer(String id, String name, String image, String status) {
        this.id = id;
        this.name = name;
        this.image = image;
        this.status = status;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getImage() {
        return image;
    }

    public String getStatus() {
        return status;
    }
}
